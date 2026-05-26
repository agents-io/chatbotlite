export interface ChatStorage {
  loadMessages(sessionId: string): Promise<StoredMessage[]>;
  saveMessages(sessionId: string, messages: StoredMessage[]): Promise<void>;
  loadTitle(sessionId: string): Promise<string | null>;
  saveTitle(sessionId: string, title: string): Promise<void>;
}

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export class LocalChatStorage implements ChatStorage {
  private prefix: string;

  constructor(prefix = "cbl") {
    this.prefix = prefix;
  }

  private key(sessionId: string, suffix: string): string {
    return `${this.prefix}-${sessionId}-${suffix}`;
  }

  async loadMessages(sessionId: string): Promise<StoredMessage[]> {
    try {
      const raw = localStorage.getItem(this.key(sessionId, "msgs"));
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async saveMessages(sessionId: string, messages: StoredMessage[]): Promise<void> {
    try {
      localStorage.setItem(this.key(sessionId, "msgs"), JSON.stringify(messages));
    } catch {
      // localStorage full or unavailable
    }
  }

  async loadTitle(sessionId: string): Promise<string | null> {
    try {
      return localStorage.getItem(this.key(sessionId, "title"));
    } catch {
      return null;
    }
  }

  async saveTitle(sessionId: string, title: string): Promise<void> {
    try {
      localStorage.setItem(this.key(sessionId, "title"), title);
    } catch {
      // localStorage full or unavailable
    }
  }
}
