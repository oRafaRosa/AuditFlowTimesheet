import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { User, Project, TimesheetEntry, Holiday, CalendarException, HOURS_PER_DAY, TimesheetPeriod, PeriodStatus, FrequentEntryTemplate, TimesheetPeriodEvent, UserActivityEvent, UserActivityType, UserLoginActivity, RiskMatrixAccess, RiskMatrixRecord } from '../types';
import { formatLocalDate, normalizeDateValue } from '../utils/date';
import { loadingState } from './loadingState';

// --- CONFIGURAÇÃO DO SUPABASE ---
// pegando do .env se existir, senão usa fallback pra build funcionar
// em prod, sempre trocar essas credenciais antes de deployar
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://odynsxzfuctvqurtrwhz.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || 'sb_publishable_kWDnXvgjYwU7sc4Ypb9SWA_n48HTGgV';
const RISK_MATRIX_ENCRYPTION_KEY = import.meta.env.VITE_RISK_MATRIX_ENCRYPTION_KEY || '';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// chaves de storage (só sessão local)
const KEYS = {
  CURRENT_USER: 'grc_current_user',
  HOLIDAYS: 'grc_holidays', // fallback se não tiver no banco
  FREQUENT_TEMPLATES: 'grc_frequent_templates',
  DAILY_HOUR_LIMIT: 'grc_daily_hour_limit'
};

const DEFAULT_DAILY_HOUR_LIMIT = 10;

// hash sha-256 de 'AuditFlow@2025'
const DEFAULT_PASSWORD_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';

const normalizeRiskMatrixAccess = (value: any): RiskMatrixAccess => {
  if (value === 'READ' || value === 'EDIT') return value;
  return 'NONE';
};

const isUuid = (value?: string): boolean => {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
};

const fromBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

class StoreService {
  constructor() {
    // opcional: checar conexão ou dar init
  }

  // wrapper pra registrar loading das operações
  private async withLoading<T>(operation: () => Promise<T>): Promise<T> {
    loadingState.startLoading();
    try {
      return await operation();
    } finally {
      loadingState.stopLoading();
    }
  }

  private isMissingRelationError(error: any): boolean {
    const message = error?.message || '';
    return typeof message === 'string' && (
      message.includes('does not exist') ||
      message.includes('Could not find the table') ||
      message.includes('relation') ||
      message.includes('schema cache')
    );
  }

  // --- helper: hash sha-256 no browser ---
  async hashPassword(plainText: string): Promise<string> {
    try {
        if (typeof crypto === 'undefined' || !crypto.subtle) {
            console.warn("Crypto API não disponível (contexto inseguro?). Hash de senha ignorado.");
            return '';
        }
        const msgBuffer = new TextEncoder().encode(plainText);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        console.warn("Erro ao gerar hash da senha:", e);
        return '';
    }
  }

  private async getRiskMatrixCryptoKey(): Promise<CryptoKey | null> {
    if (!RISK_MATRIX_ENCRYPTION_KEY || RISK_MATRIX_ENCRYPTION_KEY.trim().length < 16) {
      console.warn('VITE_RISK_MATRIX_ENCRYPTION_KEY ausente ou muito curta. Defina no .env para liberar criptografia da matriz.');
      return null;
    }

    const rawKey = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(RISK_MATRIX_ENCRYPTION_KEY));
    return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }

  private async encryptRiskPayload(payload: unknown): Promise<string> {
    const key = await this.getRiskMatrixCryptoKey();
    if (!key) throw new Error('Chave de criptografia da matriz de riscos nao configurada.');

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plainBytes = new TextEncoder().encode(JSON.stringify(payload));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBytes);

    return `${toBase64(iv)}:${toBase64(new Uint8Array(encrypted))}`;
  }

  private async decryptRiskPayload(payloadCipher: string): Promise<any | null> {
    try {
      const key = await this.getRiskMatrixCryptoKey();
      if (!key) return null;

      const [ivBase64, cipherBase64] = payloadCipher.split(':');
      if (!ivBase64 || !cipherBase64) return null;

      const iv = fromBase64(ivBase64);
      const encryptedBytes = fromBase64(cipherBase64);
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) },
        key,
        new Uint8Array(encryptedBytes)
      );
      const json = new TextDecoder().decode(new Uint8Array(decrypted));
      return JSON.parse(json);
    } catch (error) {
      console.warn('Falha ao descriptografar payload de risco:', error);
      return null;
    }
  }

  // --- auth (híbrido: sessão local + verify remoto) ---
  
  async login(email: string, password?: string): Promise<User | null> {
    try {
        console.log(`Tentando login para: ${email}`);
        
        // usa maybeSingle pra não quebrar com 0 resultado
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .ilike('email', email.trim()) 
            .maybeSingle();

        if (error) {
            console.error("Login: Erro de conexão com Supabase. Verifique a chave de API e a URL.", error);
            return null;
        }

        if (!data) {
            console.warn(`Login: Usuário '${email}' não encontrado na base de dados.`);
            return null;
        }

        // valida senha
        if (password) {
            const dbPassword = data.password ? data.password.trim() : null;
            
            // 1. bypass pra senha padrão
            const isDefaultInput = password === 'AuditFlow@2025';
            const isDefaultDB = dbPassword === DEFAULT_PASSWORD_HASH;

            if (isDefaultInput && isDefaultDB) {
                console.log("Login: Senha padrão reconhecida (Bypass Hash).");
            } else if (dbPassword) {
                 // 2. checagem padrão do hash
                 const inputHash = await this.hashPassword(password);
                 
                 const hashMatch = inputHash && (dbPassword.toLowerCase() === inputHash);
                 const plainMatch = dbPassword === password;
                 
                 if (!hashMatch && !plainMatch) {
                     console.warn("Login: Senha incorreta.");
                     return null;
                 }
            }
        }

        // checa se a senha atual (hash ou plain) bate com a padrão
        const isDefault = data.password === DEFAULT_PASSWORD_HASH || data.password === 'AuditFlow@2025';

        if (data.is_active === false) {
            console.warn(`Login bloqueado para usuário inativo: ${email}`);
            return null;
        }

        const user: User = {
            id: data.id,
            name: data.full_name,
            email: data.email,
            role: data.role,
          riskMatrixAccess: normalizeRiskMatrixAccess(data.risk_matrix_access),
          area: data.area || undefined,
          admissionDate: data.admission_date || '2020-01-01',
          terminationDate: data.termination_date || undefined,
            isActive: data.is_active !== false,
            managerId: data.manager_id,
            avatarUrl: `https://ui-avatars.com/api/?name=${data.full_name}`,
            isDefaultPassword: isDefault
        };

        localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(user));
        return user;
    } catch (e) {
        console.error("Exceção não tratada no Login:", e);
        return null;
    }
  }

  async changePassword(userId: string, newPassword: string): Promise<boolean> {
      try {
          const newHash = await this.hashPassword(newPassword);
          if (!newHash) return false;

          const { error } = await supabase
            .from('profiles')
            .update({ password: newHash })
            .eq('id', userId);
          
          if (error) throw error;
          
          const currentUser = this.getCurrentUser();
          if (currentUser && currentUser.id === userId) {
              currentUser.isDefaultPassword = false;
              localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(currentUser));
          }

          return true;
      } catch (e) {
          console.error("Erro ao alterar senha", e);
          return false;
      }
  }

  logout() {
    localStorage.removeItem(KEYS.CURRENT_USER);
  }

  getCurrentUser(): User | null {
    const stored = localStorage.getItem(KEYS.CURRENT_USER);
    return stored ? JSON.parse(stored) : null;
  }

  async syncCurrentUserFromDatabase(): Promise<User | null> {
    const currentUser = this.getCurrentUser();
    if (!currentUser?.id) return null;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .maybeSingle();

      if (error || !data) return currentUser;

      const syncedUser: User = {
        ...currentUser,
        name: data.full_name,
        email: data.email,
        role: data.role,
        riskMatrixAccess: normalizeRiskMatrixAccess(data.risk_matrix_access),
        area: data.area || undefined,
        admissionDate: data.admission_date || currentUser.admissionDate || '2020-01-01',
        terminationDate: data.termination_date || undefined,
        isActive: data.is_active !== false,
        requiresTimesheet: data.requires_timesheet !== false,
        managerId: data.manager_id,
        delegatedManagerId: data.delegated_manager_id,
        avatarUrl: `https://ui-avatars.com/api/?name=${data.full_name}`
      };

      localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(syncedUser));
      return syncedUser;
    } catch {
      return currentUser;
    }
  }

  async recordLoginActivity(userId: string, activityDate = formatLocalDate()): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_login_activity')
        .upsert({
          user_id: userId,
          activity_date: activityDate,
          created_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,activity_date'
        });

      if (error) throw error;
      return true;
    } catch (error) {
      if (!this.isMissingRelationError(error)) {
        console.warn('Erro ao registrar login diário:', error);
      }
      return false;
    }
  }

  async getLoginActivity(userIds?: string[]): Promise<UserLoginActivity[]> {
    try {
      let query = supabase
        .from('user_login_activity')
        .select('*')
        .order('activity_date', { ascending: false });

      if (userIds && userIds.length > 0) {
        query = query.in('user_id', userIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((item: any) => ({
        userId: item.user_id,
        activityDate: item.activity_date,
        createdAt: item.created_at
      }));
    } catch (error) {
      if (!this.isMissingRelationError(error)) {
        console.warn('Erro ao buscar histórico de login:', error);
      }
      return [];
    }
  }

  async recordUserActivityEvent(
    userId: string,
    activityType: UserActivityType,
    activityDate = formatLocalDate()
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('user_activity_events')
        .upsert({
          user_id: userId,
          activity_type: activityType,
          activity_date: activityDate,
          created_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,activity_type,activity_date'
        });

      if (error) throw error;
      return true;
    } catch (error) {
      if (!this.isMissingRelationError(error)) {
        console.warn('Erro ao registrar atividade do usuário:', error);
      }
      return false;
    }
  }

  async getUserActivityEvents(userIds?: string[], activityType?: UserActivityType): Promise<UserActivityEvent[]> {
    try {
      let query = supabase
        .from('user_activity_events')
        .select('*')
        .order('activity_date', { ascending: false });

      if (userIds && userIds.length > 0) {
        query = query.in('user_id', userIds);
      }

      if (activityType) {
        query = query.eq('activity_type', activityType);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((item: any) => ({
        userId: item.user_id,
        activityType: item.activity_type,
        activityDate: item.activity_date,
        createdAt: item.created_at
      }));
    } catch (error) {
      if (!this.isMissingRelationError(error)) {
        console.warn('Erro ao buscar atividades do usuário:', error);
      }
      return [];
    }
  }

  async recordPeriodEvent(event: Omit<TimesheetPeriodEvent, 'id'>): Promise<boolean> {
    try {
      const payload = {
        period_id: event.periodId || null,
        user_id: event.userId,
        manager_id: event.managerId || null,
        actor_user_id: event.actorUserId || null,
        year: event.year,
        month: event.month,
        event_type: event.eventType,
        occurred_at: event.occurredAt
      };

      const { error } = await supabase
        .from('timesheet_period_events')
        .insert(payload);

      if (error) throw error;
      return true;
    } catch (error) {
      if (!this.isMissingRelationError(error)) {
        console.warn('Erro ao registrar evento de período:', error);
      }
      return false;
    }
  }

  async getPeriodEvents(userIds?: string[], managerId?: string): Promise<TimesheetPeriodEvent[]> {
    try {
      let query = supabase
        .from('timesheet_period_events')
        .select('*')
        .order('occurred_at', { ascending: false });

      if (userIds && userIds.length > 0) {
        query = query.in('user_id', userIds);
      }

      if (managerId) {
        query = query.eq('manager_id', managerId);
      }

      const { data, error } = await query;
      if (error) throw error;

      return (data || []).map((item: any) => ({
        id: item.id,
        periodId: item.period_id,
        userId: item.user_id,
        managerId: item.manager_id,
        actorUserId: item.actor_user_id,
        year: item.year,
        month: item.month,
        eventType: item.event_type,
        occurredAt: item.occurred_at
      }));
    } catch (error) {
      if (!this.isMissingRelationError(error)) {
        console.warn('Erro ao buscar eventos de período:', error);
      }
      return [];
    }
  }

  // --- usuários ---
  
  async getUsers(): Promise<User[]> {
    return this.withLoading(async () => {
      const { data, error } = await supabase.from('profiles').select('*');
      if (error) return [];
      
      return data.map((d: any) => ({
          id: d.id,
          name: d.full_name,
          email: d.email,
          role: d.role,
          riskMatrixAccess: normalizeRiskMatrixAccess(d.risk_matrix_access),
          area: d.area || undefined,
          admissionDate: d.admission_date || '2020-01-01',
          terminationDate: d.termination_date || undefined,
          isActive: d.is_active !== false,
          requiresTimesheet: d.requires_timesheet !== false,
          managerId: d.manager_id,
          delegatedManagerId: d.delegated_manager_id,
          avatarUrl: `https://ui-avatars.com/api/?name=${d.full_name}`
      }));
    });
  }

  async addUser(user: Omit<User, 'id'>): Promise<User | null> {
    return this.withLoading(async () => {
      const managerIdValue = (user.managerId && user.managerId.trim() !== '') ? user.managerId : null;
      
      const dbUser = {
          full_name: user.name,
          email: user.email.trim(),
          role: user.role,
          risk_matrix_access: normalizeRiskMatrixAccess(user.riskMatrixAccess),
          area: user.area || null,
          admission_date: user.admissionDate || '2020-01-01',
          termination_date: user.terminationDate || null,
          manager_id: managerIdValue,
          is_active: user.isActive !== false,
        requires_timesheet: user.requiresTimesheet !== false,
          password: DEFAULT_PASSWORD_HASH // seta senha padrão pros novos
      };

      const { data, error } = await supabase.from('profiles').insert(dbUser).select().single();
      if (error) {
          console.error("Erro ao adicionar usuário:", error);
          return null;
      }
      
      return {
          id: data.id,
          name: data.full_name,
          email: data.email,
          role: data.role,
          riskMatrixAccess: normalizeRiskMatrixAccess(data.risk_matrix_access),
          area: data.area || undefined,
          admissionDate: data.admission_date || '2020-01-01',
          terminationDate: data.termination_date || undefined,
          isActive: data.is_active !== false,
        requiresTimesheet: data.requires_timesheet !== false,
          managerId: data.manager_id,
          avatarUrl: `https://ui-avatars.com/api/?name=${data.full_name}`
      };
    });
  }

  async updateUser(id: string, data: Partial<User>) {
    const dbUpdate: any = {};
    if (data.name) dbUpdate.full_name = data.name;
    if (data.email) dbUpdate.email = data.email.trim();
    if (data.role) dbUpdate.role = data.role;
    if (data.riskMatrixAccess !== undefined) dbUpdate.risk_matrix_access = normalizeRiskMatrixAccess(data.riskMatrixAccess);
    if (data.area !== undefined) dbUpdate.area = data.area || null;
    if (data.admissionDate !== undefined) dbUpdate.admission_date = data.admissionDate || '2020-01-01';
    if (data.terminationDate !== undefined) dbUpdate.termination_date = data.terminationDate || null;
    if (data.isActive !== undefined) dbUpdate.is_active = data.isActive;
    if (data.requiresTimesheet !== undefined) dbUpdate.requires_timesheet = data.requiresTimesheet;
    
    if (data.managerId !== undefined) {
        dbUpdate.manager_id = (data.managerId && data.managerId.trim() !== '') ? data.managerId : null;
    }

    const { error } = await supabase.from('profiles').update(dbUpdate).eq('id', id);
    if (error) {
      console.error('Erro ao atualizar usuário:', error);
      throw error;
    }

    const currentUser = this.getCurrentUser();
    if (currentUser && currentUser.id === id) {
      const updatedUser = {
        ...currentUser,
        ...data,
        riskMatrixAccess: data.riskMatrixAccess !== undefined
          ? normalizeRiskMatrixAccess(data.riskMatrixAccess)
          : currentUser.riskMatrixAccess
      };
      localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(updatedUser));
    }
  }

  // centraliza a regra do gestor efetivo pra envio e aprovação durante delegação
  private async resolveEffectiveManagerId(userId: string): Promise<string | null> {
    const { data: userProfile, error: profileError } = await supabase
      .from('profiles')
      .select('manager_id')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('Erro ao buscar gestor do usuário:', profileError);
      throw new Error('Falha ao identificar o gestor responsável. Tente novamente.');
    }

    const directManagerId = userProfile?.manager_id || null;
    if (!directManagerId) return null;

    const { data: managerProfile, error: managerError } = await supabase
      .from('profiles')
      .select('delegated_manager_id')
      .eq('id', directManagerId)
      .single();

    if (managerError) {
      console.error('Erro ao buscar delegação do gestor:', managerError);
      throw new Error('Falha ao identificar o gestor responsável. Tente novamente.');
    }

    return managerProfile?.delegated_manager_id || directManagerId;
  }

  // --- delegação de equipe ---

  async delegateTeamManagement(managerId: string, delegatedManagerId: string): Promise<boolean> {
    const { error: delegError } = await supabase
        .from('profiles')
        .update({ delegated_manager_id: delegatedManagerId })
        .eq('id', managerId);
    
    if (delegError) return false;

    // quando troca o gestor responsável, as pendências abertas também precisam seguir junto
    const { error: periodTransferError } = await supabase
        .from('timesheet_periods')
        .update({ manager_id: delegatedManagerId, updated_at: new Date().toISOString() })
        .eq('manager_id', managerId)
        .eq('status', 'SUBMITTED');

    if (periodTransferError) {
      console.error('Erro ao transferir pendências para o gestor delegado:', periodTransferError);
      return false;
    }

    // cria notificação pro gestor delegado
    const currentUser = this.getCurrentUser();
    const { data: delegatedManager } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', delegatedManagerId)
        .single();

    if (delegatedManager && currentUser) {
      const message = `${currentUser.name} delegou sua equipe a você. Você será responsável pelas aprovações até que recupere o controle.`;
      
      const { error: notifError } = await supabase
          .from('notifications')
          .insert([{
              user_id: delegatedManagerId,
              type: 'delegation',
              title: 'Delegação de Equipe Recebida',
              message,
              read: false,
              created_at: new Date().toISOString()
          }]);
      
      if (notifError) console.error('Erro ao criar notificação:', notifError);
    }

    return true;
  }

  async removeDelegation(managerId: string): Promise<boolean> {
    const { data: manager } = await supabase
        .from('profiles')
        .select('delegated_manager_id')
        .eq('id', managerId)
        .single();

    if (manager?.delegated_manager_id) {
      // quando a delegação termina, as pendências abertas voltam pro gestor titular
      const { error: periodReturnError } = await supabase
        .from('timesheet_periods')
        .update({ manager_id: managerId, updated_at: new Date().toISOString() })
        .eq('manager_id', manager.delegated_manager_id)
        .eq('status', 'SUBMITTED');

      if (periodReturnError) {
        console.error('Erro ao devolver pendências ao gestor titular:', periodReturnError);
        return false;
      }
    }

    const { error } = await supabase
        .from('profiles')
        .update({ delegated_manager_id: null })
        .eq('id', managerId);
    
    if (!error && manager?.delegated_manager_id) {
      // cria notificação pro gestor anterior
      const currentUser = this.getCurrentUser();
      if (currentUser) {
        const message = `${currentUser.name} recuperou o controle de sua equipe. Você não é mais responsável pelas aprovações.`;
        
        const { error: notifError } = await supabase
            .from('notifications')
            .insert([{
                user_id: manager.delegated_manager_id,
                type: 'delegation_removed',
                title: 'Delegação de Equipe Removida',
                message,
                read: false,
                created_at: new Date().toISOString()
            }]);
        
        if (notifError) console.error('Erro ao criar notificação:', notifError);
      }
    }

    return !error;
  }

  async getDelegatedTeams(delegatedManagerId: string): Promise<User[]> {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('delegated_manager_id', delegatedManagerId);
    
    if (error) return [];
    
    return data.map((d: any) => ({
        id: d.id,
        name: d.full_name,
        email: d.email,
        role: d.role,
      area: d.area || undefined,
        admissionDate: d.admission_date || '2020-01-01',
        terminationDate: d.termination_date || undefined,
        isActive: d.is_active !== false,
      requiresTimesheet: d.requires_timesheet !== false,
        managerId: d.manager_id,
        delegatedManagerId: d.delegated_manager_id,
        avatarUrl: `https://ui-avatars.com/api/?name=${d.full_name}`
    }));
  }

  // --- projetos ---
  
  async getProjects(): Promise<Project[]> {
    return this.withLoading(async () => {
      const { data, error } = await supabase.from('projects').select('*');
      if (error) return [];

      return data.map((p: any) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          classification: p.classification,
          area: p.area || undefined,
          budgetedHours: p.budgeted_hours,
          active: p.active,
          allowedManagerIds: p.allowed_manager_ids || []
      }));
    });
  }

  async addProject(project: Omit<Project, 'id'>) {
    const dbProject = {
        name: project.name,
        code: project.code,
        classification: project.classification,
      area: project.area || null,
        budgeted_hours: project.budgetedHours,
        active: project.active,
        allowed_manager_ids: project.allowedManagerIds
    };
    await supabase.from('projects').insert(dbProject);
  }

  async updateProject(id: string, data: Partial<Project>) {
    const dbUpdate: any = {};
    if (data.name) dbUpdate.name = data.name;
    if (data.code) dbUpdate.code = data.code;
    if (data.classification) dbUpdate.classification = data.classification;
    if (data.area !== undefined) dbUpdate.area = data.area || null;
    if (data.budgetedHours !== undefined) dbUpdate.budgeted_hours = data.budgetedHours;
    if (data.active !== undefined) dbUpdate.active = data.active;
    if (data.allowedManagerIds) dbUpdate.allowed_manager_ids = data.allowedManagerIds;

    await supabase.from('projects').update(dbUpdate).eq('id', id);
  }

  // --- lançamentos ---
  
  async getEntries(userId?: string): Promise<TimesheetEntry[]> {
    return this.withLoading(async () => {
      let allData: any[] = [];
      const pageSize = 1000;
      let page = 0;
      let hasMore = true;

      while (hasMore) {
          let query = supabase
              .from('timesheets')
              .select('*')
              .order('created_at', { ascending: false })
              .range(page * pageSize, (page + 1) * pageSize - 1);
          
          if (userId) {
              query = query.eq('user_id', userId);
          }
          
          const { data, error } = await query;
          if (error || !data || data.length === 0) {
              hasMore = false;
          } else {
              allData = allData.concat(data);
              if (data.length < pageSize) {
                  hasMore = false;
              }
          }
          page++;
      }

      const result = allData.map((e: any) => {
        // usa work_date se tiver, senão cai no date
        const displayDate = normalizeDateValue(e.work_date) || normalizeDateValue(e.date) || '';

        return {
          id: e.id,
          userId: e.user_id,
          projectId: e.project_id,
          date: displayDate,
          hours: e.hours,
          description: e.description,
          createdAt: e.created_at
        };
      });

      return result;
    });
  }

  async addEntry(entry: Omit<TimesheetEntry, 'id' | 'createdAt'>) {
    const dbEntry = {
      user_id: entry.userId,
      project_id: entry.projectId,
      date: entry.date,
      hours: entry.hours,
      description: entry.description
    };
    await supabase.from('timesheets').insert(dbEntry);
  }

  async updateEntry(id: string, entry: Partial<TimesheetEntry>) {
    const dbEntry: any = {};
    if (entry.projectId) dbEntry.project_id = entry.projectId;
    if (entry.date) dbEntry.date = entry.date;
    if (entry.hours) dbEntry.hours = entry.hours;
    if (entry.description) dbEntry.description = entry.description;

    await supabase.from('timesheets').update(dbEntry).eq('id', id);
  }

  async deleteEntry(id: string) {
    await supabase.from('timesheets').delete().eq('id', id);
  }

  // --- fluxo de aprovação (períodos) ---

  async getPeriodStatus(userId: string, year: number, month: number): Promise<TimesheetPeriod> {
      return this.withLoading(async () => {
        const { data } = await supabase
          .from('timesheet_periods')
          .select('*')
          .eq('user_id', userId)
          .eq('year', year)
          .eq('month', month)
          .maybeSingle();
        
        if (data) {
            return {
                id: data.id,
                userId: data.user_id,
                year: data.year,
                month: data.month,
                status: data.status,
                managerId: data.manager_id,
                rejectionReason: data.rejection_reason,
                updatedAt: data.updated_at
            };
        }

        return {
            id: '',
            userId,
            year,
            month,
            status: 'OPEN',
            updatedAt: new Date().toISOString()
        };
      });
  }

  // retorna só períodos onde tem lançamento ou status
  async getLastPeriods(userId: string): Promise<TimesheetPeriod[]> {
      // 1. pega todos os status de período
      const { data: statusData } = await supabase
        .from('timesheet_periods')
        .select('*')
        .eq('user_id', userId);
      
      // 2. pega meses distintos dos lançamentos
      const { data: entriesData } = await supabase
        .from('timesheets')
        .select('date, work_date')
        .eq('user_id', userId);

      // 3. junta yyyy-mm único
      const uniquePeriods = new Set<string>();

      statusData?.forEach((s: any) => {
          uniquePeriods.add(`${s.year}-${s.month}`);
      });

        entriesData?.forEach((e: any) => {
          const entryDate = e.work_date || e.date;
          if (!entryDate) return;
          const parts = entryDate.split('-');
          const year = parseInt(parts[0]);
          const month = parseInt(parts[1]) - 1; // base 0
          uniquePeriods.add(`${year}-${month}`);
      });
      
      // volta pra objetos
      const results: TimesheetPeriod[] = [];
      
      for (const periodStr of uniquePeriods) {
          const [year, month] = periodStr.split('-').map(Number);
          
          const found = statusData?.find((d: any) => d.year === year && d.month === month);
          
          if (found) {
              results.push({
                  id: found.id,
                  userId: found.user_id,
                  year: found.year,
                  month: found.month,
                  status: found.status,
                  managerId: found.manager_id,
                  rejectionReason: found.rejection_reason,
                  updatedAt: found.updated_at
              });
          } else {
              results.push({
                  id: '',
                  userId,
                  year: year,
                  month: month,
                  status: 'OPEN',
                  updatedAt: new Date().toISOString()
              });
          }
      }

      return results.sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          return b.month - a.month;
      });
  }

  async getTimesheetPeriods(userIds?: string[]): Promise<TimesheetPeriod[]> {
      let query = supabase
        .from('timesheet_periods')
        .select('*')
        .order('updated_at', { ascending: false });

      if (userIds && userIds.length > 0) {
        query = query.in('user_id', userIds);
      }

      const { data, error } = await query;
      if (error || !data) return [];

      return data.map((item: any) => ({
        id: item.id,
        userId: item.user_id,
        year: item.year,
        month: item.month,
        status: item.status,
        managerId: item.manager_id,
        rejectionReason: item.rejection_reason,
        updatedAt: item.updated_at
      }));
  }

  async submitPeriod(userId: string, year: number, month: number) {
      // ajuste da regra: agora o envio olha o gestor do colaborador e,
      // se esse gestor tiver delegado a equipe, grava o substituto como responsável.
      const currentManagerId = await this.resolveEffectiveManagerId(userId);
      
      // se o user tem gestor (ou delegado), envia. se não, aprova direto
      const newStatus: PeriodStatus = currentManagerId ? 'SUBMITTED' : 'APPROVED';

      try {
          // lógica de upsert
          const { data, error } = await supabase
            .from('timesheet_periods')
            .upsert({
                user_id: userId,
                year: year,
                month: month,
                status: newStatus,
                manager_id: currentManagerId ?? null, // salva o gestor (ou delegado) no envio
                updated_at: new Date().toISOString(),
                rejection_reason: null
            }, {
                onConflict: 'user_id, year, month'
            })
            .select()
            .single();

          if (error) throw error;

          this.recordPeriodEvent({
            periodId: data.id,
            userId,
            managerId: currentManagerId || undefined,
            actorUserId: userId,
            year,
            month,
            eventType: 'SUBMITTED',
            occurredAt: new Date().toISOString()
          });
          return data;

      } catch (e) {
          console.error("Critical Error in submitPeriod:", e);
          throw e;
      }
  }

  async approvePeriod(periodId: string) {
      const { data: period } = await supabase
        .from('timesheet_periods')
        .select('*')
        .eq('id', periodId)
        .maybeSingle();

      const { error } = await supabase
        .from('timesheet_periods')
        .update({ status: 'APPROVED', updated_at: new Date().toISOString() })
        .eq('id', periodId);
      if (error) throw error;

      const actorUserId = this.getCurrentUser()?.id;
      if (period) {
        this.recordPeriodEvent({
          periodId,
          userId: period.user_id,
          managerId: period.manager_id,
          actorUserId,
          year: period.year,
          month: period.month,
          eventType: 'APPROVED',
          occurredAt: new Date().toISOString()
        });
      }
  }

  async rejectPeriod(periodId: string, reason: string) {
      const { data: period } = await supabase
        .from('timesheet_periods')
        .select('*')
        .eq('id', periodId)
        .maybeSingle();

      const { error } = await supabase
        .from('timesheet_periods')
        .update({ 
            status: 'REJECTED', 
            rejection_reason: reason,
            updated_at: new Date().toISOString() 
        })
        .eq('id', periodId);
      if (error) throw error;

      const actorUserId = this.getCurrentUser()?.id;
      if (period) {
        this.recordPeriodEvent({
          periodId,
          userId: period.user_id,
          managerId: period.manager_id,
          actorUserId,
          year: period.year,
          month: period.month,
          eventType: 'REJECTED',
          occurredAt: new Date().toISOString()
        });
      }
  }

  async getPendingApprovals(managerId: string): Promise<TimesheetPeriod[]> {
      // atualizado: query separada pra evitar erro de "relationship not found"
      // causado por várias fks na tabela profiles
      
      // 1. pega os períodos que precisam de aprovação
      const { data: periods, error } = await supabase
        .from('timesheet_periods')
        .select('*')
        .eq('manager_id', managerId)
        .eq('status', 'SUBMITTED');
      
      if (error) {
          console.error("Erro ao buscar pendências:", error);
          return [];
      }

      if (!periods || periods.length === 0) return [];

      // 2. extrai ids únicos dos usuários envolvidos
      const userIds = [...new Set(periods.map((p: any) => p.user_id))];

      // 3. busca detalhes dos usuários na mão
      const { data: users } = await supabase
          .from('profiles')
          .select('id, full_name, email, avatar_url, is_active')
          .in('id', userIds);

      // 4. mapeia os resultados
      return periods
        .filter((d: any) => {
          const user = users?.find((u: any) => u.id === d.user_id);
          return user && user.is_active !== false;
        })
        .map((d: any) => {
          const user = users?.find((u: any) => u.id === d.user_id);
          return {
            id: d.id,
            userId: d.user_id,
            userName: user?.full_name || 'Usuário Desconhecido',
            year: d.year,
            month: d.month,
            status: d.status,
            updatedAt: d.updated_at
          };
      });
  }

  // --- gestão de calendário ---
  
  async getExceptions(): Promise<CalendarException[]> {
    const { data, error } = await supabase.from('calendar_exceptions').select('*');
    if (error) return [];
    return data;
  }

  async addException(exception: Omit<CalendarException, 'id'>) {
    await supabase.from('calendar_exceptions').delete().eq('date', exception.date);
    await supabase.from('calendar_exceptions').insert(exception);
  }

  async deleteException(id: string) {
    await supabase.from('calendar_exceptions').delete().eq('id', id);
  }

  async getHolidays(): Promise<Holiday[]> {
    return this.withLoading(async () => {
      const { data, error } = await supabase.from('holidays').select('*');
      if (error) return [];
      return data;
    });
  }

  // deixei as combinações frequentes no localStorage pra não depender de migration no banco
  // se depois fizer sentido levar pro Supabase, dá pra reaproveitar a interface sem dor
  getFrequentEntryTemplates(userId: string): FrequentEntryTemplate[] {
    const raw = localStorage.getItem(KEYS.FREQUENT_TEMPLATES);
    if (!raw) return [];

    try {
      const parsed: FrequentEntryTemplate[] = JSON.parse(raw);
      return parsed
        .filter((template) => template.userId === userId && template.usageCount >= 2)
        .sort((a, b) => {
          if (b.usageCount !== a.usageCount) return b.usageCount - a.usageCount;
          return new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime();
        });
    } catch {
      return [];
    }
  }

  private saveAllFrequentEntryTemplates(templates: FrequentEntryTemplate[]) {
    localStorage.setItem(KEYS.FREQUENT_TEMPLATES, JSON.stringify(templates));
  }

  recordFrequentEntryTemplate(
    userId: string,
    template: Pick<FrequentEntryTemplate, 'projectId' | 'hours' | 'description' | 'label'>
  ) {
    const raw = localStorage.getItem(KEYS.FREQUENT_TEMPLATES);
    const allTemplates: FrequentEntryTemplate[] = raw ? JSON.parse(raw) : [];
    const normalizedDescription = template.description.trim();

    const existing = allTemplates.find((item) =>
      item.userId === userId &&
      item.projectId === template.projectId &&
      item.hours === template.hours &&
      item.description.trim().toLowerCase() === normalizedDescription.toLowerCase()
    );

    if (existing) {
      existing.usageCount += 1;
      existing.label = template.label;
      existing.lastUsedAt = new Date().toISOString();
      this.saveAllFrequentEntryTemplates(allTemplates);
      return existing;
    }

    const newTemplate: FrequentEntryTemplate = {
      id: crypto.randomUUID(),
      userId,
      projectId: template.projectId,
      hours: template.hours,
      description: normalizedDescription,
      label: template.label,
      usageCount: 1,
      lastUsedAt: new Date().toISOString()
    };

    allTemplates.push(newTemplate);
    this.saveAllFrequentEntryTemplates(allTemplates);
    return newTemplate;
  }

  deleteFrequentEntryTemplate(userId: string, templateId: string) {
    const raw = localStorage.getItem(KEYS.FREQUENT_TEMPLATES);
    if (!raw) return;

    const allTemplates: FrequentEntryTemplate[] = JSON.parse(raw);
    this.saveAllFrequentEntryTemplates(
      allTemplates.filter((template) => !(template.userId === userId && template.id === templateId))
    );
  }

  // --- matriz de riscos ---

  getRiskMatrixAccessForCurrentUser(): RiskMatrixAccess {
    const currentUser = this.getCurrentUser();
    if (!currentUser) return 'NONE';
    if (currentUser.role === 'ADMIN') return 'EDIT';
    return normalizeRiskMatrixAccess(currentUser.riskMatrixAccess);
  }

  async getRiskMatrixRecords(): Promise<RiskMatrixRecord[]> {
    const access = this.getRiskMatrixAccessForCurrentUser();
    if (access === 'NONE') return [];

    const { data, error } = await supabase
      .from('risk_matrix_records')
      .select('*')
      .order('risk_code', { ascending: true });

    if (error) {
      console.warn('Erro ao buscar registros da matriz de riscos:', error);
      return [];
    }

    const decrypted = await Promise.all((data || []).map(async (row: any) => {
      const payload = await this.decryptRiskPayload(row.payload_encrypted);
      if (!payload) return null;

      const normalizedRecord: RiskMatrixRecord = {
        id: row.id,
        code: row.risk_code,
        title: String(payload.title || row.risk_code),
        category: payload.category || undefined,
        ownerArea: payload.ownerArea || undefined,
        inherentImpact: Number(payload.inherentImpact || 0),
        inherentProbability: Number(payload.inherentProbability || 0),
        residualImpact: Number(payload.residualImpact || 0),
        residualProbability: Number(payload.residualProbability || 0),
        updatedAt: row.updated_at,
        updatedBy: row.updated_by || undefined
      };

      if (
        !Number.isFinite(normalizedRecord.inherentImpact) ||
        !Number.isFinite(normalizedRecord.inherentProbability) ||
        !Number.isFinite(normalizedRecord.residualImpact) ||
        !Number.isFinite(normalizedRecord.residualProbability)
      ) {
        return null;
      }

      return normalizedRecord;
    }));

    return decrypted.filter((item): item is RiskMatrixRecord => item !== null);
  }

  async saveRiskMatrixRecord(record: Omit<RiskMatrixRecord, 'updatedAt' | 'updatedBy'>): Promise<boolean> {
    const access = this.getRiskMatrixAccessForCurrentUser();
    if (access !== 'EDIT') return false;

    const currentUser = this.getCurrentUser();
    if (!currentUser) return false;

    const payload = {
      title: record.title,
      category: record.category || null,
      ownerArea: record.ownerArea || null,
      inherentImpact: record.inherentImpact,
      inherentProbability: record.inherentProbability,
      residualImpact: record.residualImpact,
      residualProbability: record.residualProbability
    };

    const encrypted = await this.encryptRiskPayload(payload);

    const { error } = await supabase
      .from('risk_matrix_records')
      .upsert({
        risk_code: record.code,
        payload_encrypted: encrypted,
        updated_by: isUuid(currentUser.id) ? currentUser.id : null,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'risk_code'
      });

    if (error) {
      console.warn('Erro ao salvar registro da matriz de riscos:', error);
      return false;
    }

    return true;
  }

  // --- configurações globais ---

  async getDailyHourLimit(): Promise<number> {
    try {
      const { data, error } = await supabase
        .from('app_settings')
        .select('setting_value')
        .eq('setting_key', 'daily_hour_limit')
        .maybeSingle();

      if (error) throw error;

      const parsed = Number(data?.setting_value);
      if (Number.isFinite(parsed) && parsed > 0) {
        localStorage.setItem(KEYS.DAILY_HOUR_LIMIT, String(parsed));
        return parsed;
      }
    } catch (error) {
      if (!this.isMissingRelationError(error)) {
        console.warn('Erro ao buscar limite diário de horas:', error);
      }
    }

    const localLimit = Number(localStorage.getItem(KEYS.DAILY_HOUR_LIMIT));
    if (Number.isFinite(localLimit) && localLimit > 0) return localLimit;

    return DEFAULT_DAILY_HOUR_LIMIT;
  }

  async updateDailyHourLimit(limit: number): Promise<boolean> {
    const normalized = Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_DAILY_HOUR_LIMIT;

    localStorage.setItem(KEYS.DAILY_HOUR_LIMIT, String(normalized));

    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          setting_key: 'daily_hour_limit',
          setting_value: String(normalized),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'setting_key'
        });

      if (error) throw error;
      return true;
    } catch (error) {
      if (!this.isMissingRelationError(error)) {
        console.warn('Erro ao salvar limite diário de horas:', error);
      }
      return false;
    }
  }

  // --- helpers de analytics ---
  
  private isWorkingDay(d: Date, holidays: Holiday[], exceptions: CalendarException[]): boolean {
      const dateString = formatLocalDate(d);
      const dayOfWeek = d.getDay();
      
      const exception = exceptions.find(e => e.date === dateString);
      if (exception) {
          return exception.type === 'WORKDAY';
      }

      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = holidays.some((h: Holiday) => h.date === dateString);

      return !isWeekend && !isHoliday;
  }

  async getExpectedHours(year: number, month: number): Promise<number> {
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0); 
    let workingDays = 0;
    
    const { data: holidaysData } = await supabase.from('holidays').select('*');
    const holidays = holidaysData || [];
    const exceptions = await this.getExceptions();

    for (let d = startDate; d <= endDate; d.setDate(d.getDate() + 1)) {
        if (this.isWorkingDay(d, holidays, exceptions)) {
            workingDays++;
        }
    }
    return Math.round(workingDays * HOURS_PER_DAY * 100) / 100;
  }

  async getExpectedHoursToDate(year: number, month: number): Promise<number> {
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;
    
    if (!isCurrentMonth) {
        if (new Date(year, month, 1) < today) return this.getExpectedHours(year, month);
        return 0; 
    }

    const startDate = new Date(year, month, 1);
    let workingDays = 0;
    
    const { data: holidaysData } = await supabase.from('holidays').select('*');
    const holidays = holidaysData || [];
    const exceptions = await this.getExceptions();

    for (let d = startDate; d <= today; d.setDate(d.getDate() + 1)) {
        if (this.isWorkingDay(d, holidays, exceptions)) {
            workingDays++;
        }
    }
    return Math.round(workingDays * HOURS_PER_DAY * 100) / 100;
  }
}

export const store = new StoreService();

export const SUPABASE_SCHEMA_SQL = `
-- 1. Habilita extensão para gerar UUIDs
create extension if not exists "pgcrypto";

-- 2. Tabela de Perfis (Usuários)
create table if not exists profiles (
  id uuid default gen_random_uuid() primary key,
  full_name text not null,
  role text default 'USER' check (role in ('ADMIN', 'MANAGER', 'USER')),
  risk_matrix_access text default 'NONE' check (risk_matrix_access in ('NONE', 'READ', 'EDIT')),
  area text,
  admission_date date default '2020-01-01',
  termination_date date,
  is_active boolean default true,
  requires_timesheet boolean default true,
  manager_id uuid references profiles(id),
  email text unique not null,
  password text
);

-- coluna para ambientes já existentes
alter table profiles add column if not exists requires_timesheet boolean default true;
alter table profiles add column if not exists risk_matrix_access text default 'NONE';
alter table profiles add column if not exists area text;
alter table profiles add column if not exists admission_date date default '2020-01-01';
alter table profiles add column if not exists termination_date date;
alter table profiles drop constraint if exists profiles_area_check;
alter table profiles drop constraint if exists profiles_risk_matrix_access_check;
alter table profiles
  add constraint profiles_risk_matrix_access_check
  check (risk_matrix_access in ('NONE', 'READ', 'EDIT'));
alter table profiles
  add constraint profiles_area_check
  check (
    area is null or area in (
      'AUDITORIA_INTERNA',
      'CONTROLES_INTERNOS',
      'COMPLIANCE',
      'CANAL_DENUNCIAS',
      'GESTAO_RISCOS_DIGITAIS',
      'OUTROS'
    )
  );

-- 3. Tabela de Projetos
create table if not exists projects (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  code text,
  classification text,
  area text,
  budgeted_hours numeric default 0,
  active boolean default true,
  allowed_manager_ids text[], 
  created_at timestamp with time zone default timezone('utc'::text, now())
);

alter table projects drop constraint if exists projects_area_check;
alter table projects
  add constraint projects_area_check
  check (
    area is null or area in (
      'AUDITORIA_INTERNA',
      'CONTROLES_INTERNOS',
      'COMPLIANCE',
      'CANAL_DENUNCIAS',
      'GESTAO_RISCOS_DIGITAIS',
      'OUTROS'
    )
  );

-- 4. Tabela de Timesheet (Lançamentos)
create table if not exists timesheets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) not null,
  project_id uuid references projects(id) not null,
  date date not null,
  hours numeric not null,
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 5. Tabelas Auxiliares de Calendário
create table if not exists calendar_exceptions (
  id uuid default gen_random_uuid() primary key,
  date date not null,
  type text check (type in ('OFFDAY', 'WORKDAY')),
  name text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists holidays (
  id uuid default gen_random_uuid() primary key,
  date date not null,
  name text
);

-- 6. Tabela de Períodos e Aprovações
create table if not exists timesheet_periods (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) not null,
  manager_id uuid references profiles(id),
  year integer not null,
  month integer not null, -- 0 based for consistency with JS
  status text check (status in ('OPEN', 'SUBMITTED', 'APPROVED', 'REJECTED')),
  rejection_reason text,
  updated_at timestamp with time zone default timezone('utc'::text, now()),
  unique(user_id, year, month)
);

-- 7. Tabelas de Gamificação
create table if not exists user_login_activity (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) not null,
  activity_date date not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique(user_id, activity_date)
);

create table if not exists timesheet_period_events (
  id uuid default gen_random_uuid() primary key,
  period_id uuid references timesheet_periods(id),
  user_id uuid references profiles(id) not null,
  manager_id uuid references profiles(id),
  actor_user_id uuid references profiles(id),
  year integer not null,
  month integer not null,
  event_type text check (event_type in ('SUBMITTED', 'APPROVED', 'REJECTED')) not null,
  occurred_at timestamp with time zone default timezone('utc'::text, now())
);

create table if not exists user_activity_events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) not null,
  activity_type text check (activity_type in ('REPORT_VIEW', 'DASHBOARD_VIEW', 'HELP_CENTER_VIEW')) not null,
  activity_date date not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique(user_id, activity_type, activity_date)
);

-- 8. Configurações globais
create table if not exists app_settings (
  setting_key text primary key,
  setting_value text,
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 9. Matriz de Riscos (payload criptografado no app)
create table if not exists risk_matrix_records (
  id uuid default gen_random_uuid() primary key,
  risk_code text unique not null,
  payload_encrypted text not null,
  updated_by uuid references profiles(id),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- 10. CRIAR USUÁRIO ADMIN (Senha padrão AuditFlow@2025 já no hash)
insert into profiles (full_name, email, role, password)
values ('Administrador', 'admin@auditflow.com', 'ADMIN', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918')
on conflict (email) do nothing;

-- 11. GARANTIR PERMISSÕES E RECARREGAR CACHE (Fix para erros de 'table not found')
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
`;
