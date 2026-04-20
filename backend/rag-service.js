const { ChromaClient } = require('chromadb');
const { pipeline } = require('@xenova/transformers');

class RAGService {
  constructor() {
    this.client = new ChromaClient();
    this.collection = null;
    this.embedder = null;
  }

  async init() {
    // Embedding model (local hi use karo, free)
    this.embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    
    // Collection create karo
    this.collection = await this.client.createCollection({
      name: "chat_memory",
    });
  }

  async addToMemory(text, metadata) {
    const embedding = await this.embedder(text, { pooling: 'mean' });
    await this.collection.add({
      ids: [Date.now().toString()],
      embeddings: [Array.from(embedding.data)],
      metadatas: [metadata],
      documents: [text]
    });
  }

  async searchContext(query) {
    const queryEmbedding = await this.embedder(query, { pooling: 'mean' });
    const results = await this.collection.query({
      queryEmbeddings: [Array.from(queryEmbedding.data)],
      nResults: 3
    });
    return results.documents[0] || [];
  }
}

module.exports = RAGService;