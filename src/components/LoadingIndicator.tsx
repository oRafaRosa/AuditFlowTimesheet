import React, { useEffect, useState } from 'react';
import { loadingState } from '../services/loadingState';

export const LoadingIndicator: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = loadingState.subscribe((loading) => {
      setIsLoading(loading);
    });
    return unsubscribe;
  }, []);

  if (!isLoading) return null;

  return (
    <div className="fixed bottom-12 right-4 z-40 flex items-center gap-2 pointer-events-none">
      <div className="relative w-5 h-5">
        <div
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-brand-500 border-r-brand-500 animate-spin"
          style={{ animationDuration: '0.8s' }}
        />
      </div>
      <span className="text-xs text-slate-500 font-medium">carregando...</span>
    </div>
  );
};
