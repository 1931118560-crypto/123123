export type MemoryTheme =
  | 'sleep'
  | 'stress'
  | 'emotion'
  | 'relationship'
  | 'confidence'
  | 'focus'
  | 'gratitude';

export type MemoryNode = {
  id?: number;
  createdAt: number;
  summary: string;
  tags: string[];
  sourceQuestion?: string;
  sourceAnswer: string;
};

const DB_NAME = 'mindplan_local_memory_db';
const DB_VERSION = 1;
const STORE_NAME = 'memory_nodes';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function compressMemory(question: string, answer: string): { summary: string; tags: string[] } {
  const text = `${question} ${answer}`.replace(/\s+/g, ' ').trim();
  const normalized = text.toLowerCase();
  const tags: string[] = [];
  const tagRules: Array<[string, string[]]> = [
    ['sleep', ['sleep', 'insomnia', 'awake', 'dream', 'night']],
    ['stress', ['stress', 'anxiety', 'tense', 'overtime', 'task', 'deadline', 'work']],
    ['emotion', ['sad', 'hurt', 'upset', 'afraid', 'happy', 'loss', 'emotion', 'overwhelmed']],
    ['relationship', ['family', 'partner', 'friend', 'colleague', 'relationship', 'argument']],
    ['confidence', ['confidence', 'self-doubt', 'worth', 'self-criticism', 'not good enough']],
    ['focus', ['focus', 'distracted', 'procrastination', 'efficiency', 'attention']],
    ['gratitude', ['gratitude', 'thankful', 'lucky', 'appreciate']]
  ];

  for (const [tag, keys] of tagRules) {
    if (keys.some((k) => normalized.includes(k))) tags.push(tag);
  }

  const summary = text.length > 120 ? `${text.slice(0, 117)}...` : text;
  return { summary, tags: Array.from(new Set(tags)) };
}

export async function saveMemoryNode(node: Omit<MemoryNode, 'id'>): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.add(node);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getAllMemoryNodes(limit = 200): Promise<MemoryNode[]> {
  const db = await openDB();
  const items = await new Promise<MemoryNode[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const rows = (req.result as MemoryNode[]).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
  db.close();
  return items;
}

export async function getMemoryByTheme(theme: MemoryTheme, limit = 20): Promise<MemoryNode[]> {
  const all = await getAllMemoryNodes(500);
  return all
    .filter((n) => n.tags.includes(theme))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

export async function clearLocalMemory(): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}
