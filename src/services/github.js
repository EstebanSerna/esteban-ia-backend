// Cliente minimo de la API de Contenidos de GitHub (github.com/EstebanSerna/esteban-ia).
// Cada escritura crea un commit directo a "main", lo que dispara el mismo
// GitHub Actions que ya despliega el sitio por SFTP -- no hace falta nada
// nuevo del lado del hosting.
const REPO = process.env.BLOG_GITHUB_REPO || "EstebanSerna/esteban-ia";
const BRANCH = "main";

function getToken() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN no configurado");
  return token;
}

async function githubRequest(path, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers || {})
    }
  });
  return response;
}

// Devuelve { content, sha } del archivo, o null si no existe.
export async function getFile(path) {
  const res = await githubRequest(`/contents/${path}?ref=${BRANCH}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub getFile(${path}) -> ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { content: Buffer.from(data.content, "base64").toString("utf8"), sha: data.sha };
}

// Crea o actualiza un archivo (detecta el sha actual solo si no se paso).
export async function putFile(path, content, message) {
  const existing = await getFile(path);
  const res = await githubRequest(`/contents/${path}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
      branch: BRANCH,
      ...(existing ? { sha: existing.sha } : {})
    })
  });
  if (!res.ok) throw new Error(`GitHub putFile(${path}) -> ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function deleteFile(path, message) {
  const existing = await getFile(path);
  if (!existing) return; // ya no existe, nada que borrar
  const res = await githubRequest(`/contents/${path}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, sha: existing.sha, branch: BRANCH })
  });
  if (!res.ok) throw new Error(`GitHub deleteFile(${path}) -> ${res.status}: ${await res.text()}`);
}
