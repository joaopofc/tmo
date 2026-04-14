const express = require("express");
const cors    = require("cors");
const admin   = require("firebase-admin");
const path    = require("path");

// Carrega .env localmente (no Vercel as vars já estão no ambiente)
try { require("dotenv").config(); } catch (_) {}

// ─── Firebase Init via variáveis de ambiente ──────────────────────
const serviceAccount = {
  type:                        "service_account",
  project_id:                  process.env.FIREBASE_PROJECT_ID,
  private_key_id:              process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key:                 process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  client_email:                process.env.FIREBASE_CLIENT_EMAIL,
  client_id:                   process.env.FIREBASE_CLIENT_ID,
  auth_uri:                    "https://accounts.google.com/o/oauth2/auth",
  token_uri:                   "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url:        process.env.FIREBASE_CLIENT_CERT_URL,
};

admin.initializeApp({
  credential:  admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
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

// Middleware de autenticação do Firebase
async function verifyAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ erro: "Não autorizado. Token não fornecido." });
  }
  const token = authHeader.split(" ")[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (err) {
    console.error("Erro ao verificar token:", err);
    return res.status(401).json({ erro: "Não autorizado. Token inválido." });
  }
}

// POST /api/analisar — analisa e salva no Firebase
app.post("/api/analisar", verifyAuth, async (req, res) => {
  try {
    const { rawText, metaSegundos, operador } = req.body;

    if (!rawText || typeof rawText !== "string") {
      return res.status(400).json({ erro: "Envie o campo 'rawText' com os tempos." });
    }

    const resultado = analisarTMO(rawText, metaSegundos);

    if (resultado.erro) {
      return res.status(400).json(resultado);
    }

    // Tira os arrays grandes para não pesar o Firestore (conforme comentário)
    const { temposSegundos, temposFormatados, invalidos, ...resumo } = resultado;

    // Salva no Firestore atrelando ao ID do usuário
    const docRef = await db.collection(TMO_COLLECTION).add({
      userId: req.user.uid,
      operador: req.user.name || req.user.email || operador || "Anônimo",
      criadoEm: admin.firestore.FieldValue.serverTimestamp(),
      rawText,
      metaSegundos: metaSegundos || 300,
      ...resumo,
    });

    return res.json({ id: docRef.id, ...resultado });
  } catch (err) {
    console.error("Erro em /api/analisar:", err);
    return res.status(500).json({ erro: "Erro interno do servidor." });
  }
});

// POST /api/syncUser — Salva o usuário no banco de dados ao fazer login
app.post("/api/syncUser", verifyAuth, async (req, res) => {
  try {
    const userRef = db.collection("usuarios").doc(req.user.uid);
    await userRef.set({
      userId: req.user.uid,
      email: req.user.email || "",
      nome: req.user.name || "Usuário",
      ultimoLogin: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    
    return res.json({ sucesso: true, userId: req.user.uid });
  } catch (err) {
    console.error("Erro ao sincronizar usuário:", err);
    return res.status(500).json({ erro: "Erro ao sincronizar usuário." });
  }
});

// GET /api/historico — busca histórico de análises
app.get("/api/historico", verifyAuth, async (req, res) => {
  try {
    const limite = parseInt(req.query.limite) || 20;
    const snapshot = await db
      .collection(TMO_COLLECTION)
      .where("userId", "==", req.user.uid) // Isola os dados por usuário
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
    // Repassa mensagem original para podermos ver o erro de índice no front e ajudar o dev
    return res.status(500).json({ erro: err.message || "Erro ao buscar histórico." });
  }
});

// DELETE /api/historico/:id — deleta um registro
app.delete("/api/historico/:id", verifyAuth, async (req, res) => {
  try {
    const docRef = db.collection(TMO_COLLECTION).doc(req.params.id);
    const doc = await docRef.get();
    if (!doc.exists || doc.data().userId !== req.user.uid) {
      return res.status(403).json({ erro: "Acesso negado: o registro pertence a outro usuário." });
    }
    await docRef.delete();
    return res.json({ sucesso: true });
  } catch (err) {
    console.error("Erro ao deletar:", err);
    return res.status(500).json({ erro: "Erro ao deletar registro." });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
// Para rodar localmente e não travar o deploy serverless (Vercel/Netlify)
if (process.env.NODE_ENV !== "production") {
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`✅ TMO Analista rodando em http://localhost:${PORT}`);
  });
}

// Exporta o app para que Vercel e Netlify Functions consigam usá-lo como serverless
module.exports = app;
