const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const path = require("path");

// ─── Firebase Init ────────────────────────────────────────────────────────────
const serviceAccount = require("./servicefb.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://tubemind-ia-default-rtdb.firebaseio.com",
});

const db = admin.firestore();
const TMO_COLLECTION = "tmo_registros";

// ─── App ──────────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ─── Helpers de cálculo TMO ──────────────────────────────────────────────────

/**
 * Converte "MM:SS" → segundos (número inteiro)
 */
function parseTime(str) {
  const trimmed = str.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":");
  if (parts.length !== 2) return null;
  const mm = parseInt(parts[0], 10);
  const ss = parseInt(parts[1], 10);
  if (isNaN(mm) || isNaN(ss) || ss > 59) return null;
  return mm * 60 + ss;
}

/**
 * Converte segundos → "MM:SS"
 */
function formatSeconds(total) {
  const mm = Math.floor(total / 60);
  const ss = Math.round(total % 60);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/**
 * Calcula mediana de um array de números
 */
function calcMediana(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

/**
 * Calcula desvio padrão
 */
function calcDesvioPadrao(arr, media) {
  const variancia =
    arr.reduce((acc, v) => acc + Math.pow(v - media, 2), 0) / arr.length;
  return Math.sqrt(variancia);
}

/**
 * Classifica performance com base no TMO médio em segundos
 * Meta padrão: <= 3 minutos (180s) = Excelente, <= 5 min = Bom, <= 7 min = Atenção, > 7 min = Crítico
 * A meta pode ser enviada pelo cliente (metaSegundos)
 */
function classificar(mediaSegundos, metaSegundos) {
  const meta = metaSegundos || 300; // 5 min default
  const ratio = mediaSegundos / meta;
  if (ratio <= 0.7) return { label: "Excelente", cor: "#22c55e", emoji: "🏆" };
  if (ratio <= 1.0) return { label: "Bom", cor: "#3b82f6", emoji: "✅" };
  if (ratio <= 1.3) return { label: "Atenção", cor: "#f59e0b", emoji: "⚠️" };
  return { label: "Crítico", cor: "#ef4444", emoji: "🚨" };
}

/**
 * Identifica outliers usando 1.5 * IQR
 */
function identificarOutliers(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  const lower = q1 - 1.5 * iqr;
  const upper = q3 + 1.5 * iqr;
  return arr.filter((v) => v < lower || v > upper);
}

/**
 * Motor principal de análise de TMO
 */
function analisarTMO(rawText, metaSegundos) {
  const linhas = rawText.split("\n");
  const tempos = [];
  const invalidos = [];

  for (const linha of linhas) {
    const seg = parseTime(linha);
    if (seg !== null) {
      tempos.push(seg);
    } else if (linha.trim() !== "") {
      invalidos.push(linha.trim());
    }
  }

  if (tempos.length === 0) {
    return { erro: "Nenhum tempo válido encontrado. Use o formato MM:SS." };
  }

  const total = tempos.reduce((a, b) => a + b, 0);
  const media = total / tempos.length;
  const mediana = calcMediana(tempos);
  const desvioPadrao = calcDesvioPadrao(tempos, media);
  const minimo = Math.min(...tempos);
  const maximo = Math.max(...tempos);
  const meta = metaSegundos || 300;
  const dentrodaMeta = tempos.filter((t) => t <= meta).length;
  const percentualDentro = ((dentrodaMeta / tempos.length) * 100).toFixed(1);
  const outliers = identificarOutliers(tempos);
  const classificacao = classificar(media, meta);

  // Distribuição por faixas (quartis baseados na meta)
  const distribuicao = {
    ate1min: tempos.filter((t) => t <= 60).length,
    ate3min: tempos.filter((t) => t > 60 && t <= 180).length,
    ate5min: tempos.filter((t) => t > 180 && t <= 300).length,
    ate10min: tempos.filter((t) => t > 300 && t <= 600).length,
    acima10min: tempos.filter((t) => t > 600).length,
  };

  return {
    totalLigacoes: tempos.length,
    tempoTotal: formatSeconds(total),
    tmoMedio: formatSeconds(Math.round(media)),
    tmoMediana: formatSeconds(Math.round(mediana)),
    desvioPadrao: formatSeconds(Math.round(desvioPadrao)),
    tmoMinimo: formatSeconds(minimo),
    tmoMaximo: formatSeconds(maximo),
    percentualDentroMeta: `${percentualDentro}%`,
    classificacao,
    distribuicao,
    totalOutliers: outliers.length,
    outliersFormatados: outliers.map(formatSeconds),
    invalidos,
    meta: formatSeconds(meta),
    // dados brutos para gráficos
    temposSegundos: tempos,
    temposFormatados: tempos.map(formatSeconds),
  };
}

// ─── Rotas ────────────────────────────────────────────────────────────────────

// POST /api/analisar — analisa e salva no Firebase
app.post("/api/analisar", async (req, res) => {
  try {
    const { rawText, metaSegundos, operador } = req.body;

    if (!rawText || typeof rawText !== "string") {
      return res.status(400).json({ erro: "Envie o campo 'rawText' com os tempos." });
    }

    const resultado = analisarTMO(rawText, metaSegundos);

    if (resultado.erro) {
      return res.status(400).json(resultado);
    }

    // Salva no Firestore
    const docRef = await db.collection(TMO_COLLECTION).add({
      operador: operador || "Anônimo",
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      rawText,
      metaSegundos: metaSegundos || 300,
      ...resultado,
      // não salvar arrays grandes, só o resumo
      temposSegundos: admin.firestore.FieldValue.delete
        ? resultado.temposSegundos
        : resultado.temposSegundos,
    });

    return res.json({ id: docRef.id, ...resultado });
  } catch (err) {
    console.error("Erro em /api/analisar:", err);
    return res.status(500).json({ erro: "Erro interno do servidor." });
  }
});

// GET /api/historico — busca histórico de análises
app.get("/api/historico", async (req, res) => {
  try {
    const limite = parseInt(req.query.limite) || 20;
    const snapshot = await db
      .collection(TMO_COLLECTION)
      .orderBy("criadoEm", "desc")
      .limit(limite)
      .get();

    const registros = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      criadoEm: doc.data().criadoEm?.toDate?.()?.toISOString() || null,
    }));

    return res.json({ registros });
  } catch (err) {
    console.error("Erro em /api/historico:", err);
    return res.status(500).json({ erro: "Erro ao buscar histórico." });
  }
});

// DELETE /api/historico/:id — deleta um registro
app.delete("/api/historico/:id", async (req, res) => {
  try {
    await db.collection(TMO_COLLECTION).doc(req.params.id).delete();
    return res.json({ sucesso: true });
  } catch (err) {
    console.error("Erro ao deletar:", err);
    return res.status(500).json({ erro: "Erro ao deletar registro." });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ TMO Analista rodando em http://localhost:${PORT}`);
});
