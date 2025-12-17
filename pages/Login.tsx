
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../services/store';
import { Loader2, Eye, EyeOff } from 'lucide-react';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    // Trim inputs to avoid copy-paste whitespace errors
    const user = await store.login(email.trim(), password.trim());
    
    setLoading(false);
    if (user) {
      if(user.role === 'ADMIN') navigate('/admin');
      else if(user.role === 'MANAGER') navigate('/manager');
      else navigate('/dashboard');
    } else {
      setError('Credenciais inválidas. Verifique seu email e senha.');
    }
  };

  const clearError = () => {
      if(error) setError('');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-50 p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        
        {/* Logo Section */}
        <div className="text-center mb-8 flex flex-col items-center justify-center min-h-[160px]">
            <img 
                src="/logo.png" 
                alt="AuditFlow" 
                className="h-40 mb-4 object-contain"
            />
          <p className="text-slate-500 font-medium mt-2">Gestão de Timesheet e Projetos</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email Corporativo</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={clearError}
              className="w-full px-4 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
              placeholder="seu.nome@auditflow.com"
              disabled={loading}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
            <div className="relative">
                <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={clearError}
                    className="w-full pl-4 pr-10 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                    placeholder="••••••••"
                    disabled={loading}
                    required
                />
                <button 
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
            </div>
          </div>
          
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded">
                <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 rounded-lg transition-colors shadow-lg shadow-brand-500/30 flex justify-center items-center"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'Acessar Módulo'}
          </button>
        </form>

        <div className="mt-8 border-t border-gray-100 pt-6 text-center">
            <p className="text-xs text-slate-400">
                Primeiro acesso? Solicite o cadastro ao administrador do sistema.
            </p>
        </div>
      </div>
    </div>
  );
};
