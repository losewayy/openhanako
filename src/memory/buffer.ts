/**
 * BufferManager：对话轮次与 Verbatim Buffer
 * Phase 1 - 骨架实现
 */

export interface DialogueRound {
  round: number;
  user: string;
  agent: string;
  timestamp: number;
}

export class BufferManager {
  private rounds: DialogueRound[] = [];
  private roundCount = 0;

  addRound(user: string, agent: string): void {
    this.roundCount++;
    this.rounds.push({ round: this.roundCount, user, agent, timestamp: Date.now() });
    if (this.rounds.length > 10) {
      this.rounds.shift();
    }
  }

  getRoundCount(): number {
    return this.roundCount;
  }

  isColdStart(): boolean {
    return this.roundCount <= 5;
  }

  isWarmUp(): boolean {
    return this.roundCount > 5 && this.roundCount <= 20;
  }

  formatForPrompt(): string {
    if (this.roundCount === 0) return '';

    if (this.roundCount <= 5) {
      return this.rounds.map(r => `User: ${r.user}\nAgent: ${r.agent}`).join('\n\n');
    }

    if (this.roundCount <= 20) {
      const last = this.rounds.slice(-2);
      return last.map(r => `User: ${r.user}\nAgent: ${r.agent}`).join('\n\n');
    }

    const last = this.rounds[this.rounds.length - 1];
    return `User: ${last.user}\nAgent: ${last.agent}`;
  }

  getRecentRounds(count: number): DialogueRound[] {
    return this.rounds.slice(-count);
  }

  /**
   * 更新最后一轮的 agent 输出（用于 onAgentOutput 补全）
   */
  updateLastAgentOutput(agentOutput: string): void {
    if (this.rounds.length === 0) return;
    const last = this.rounds[this.rounds.length - 1];
    last.agent = agentOutput;
  }
}