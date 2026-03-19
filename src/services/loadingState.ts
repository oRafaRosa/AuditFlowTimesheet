// mecanismo simples e discreta de rastreamento de loading global
// permite que componentes se inscrevam para ser notificados quando há suas requisições em andamento

type LoadingCallback = (isLoading: boolean) => void;

class LoadingStateManager {
  private activeRequests = 0;
  private callbacks: Set<LoadingCallback> = new Set();

  subscribe(callback: LoadingCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  private notifyListeners() {
    const isLoading = this.activeRequests > 0;
    this.callbacks.forEach(callback => callback(isLoading));
  }

  startLoading() {
    this.activeRequests++;
    if (this.activeRequests === 1) {
      this.notifyListeners();
    }
  }

  stopLoading() {
    if (this.activeRequests > 0) {
      this.activeRequests--;
      if (this.activeRequests === 0) {
        this.notifyListeners();
      }
    }
  }

  reset() {
    this.activeRequests = 0;
    this.notifyListeners();
  }

  isLoading(): boolean {
    return this.activeRequests > 0;
  }
}

export const loadingState = new LoadingStateManager();
