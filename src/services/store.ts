import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { User, Project, TimesheetEntry, Holiday, CalendarException, HOURS_PER_DAY, TimesheetPeriod, PeriodStatus } from '../types';

// --- CONFIGURAÇÃO DO SUPABASE ---
const SUPABASE_URL = 'https://odynsxzfuctvqurtrwhz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kWDnXvgjYwU7sc4Ypb9SWA_n48HTGgV';

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

// chaves de storage (só sessão local)
const KEYS = {
  CURRENT_USER: 'grc_current_user',
  HOLIDAYS: 'grc_holidays', // fallback se não tiver no banco
};

// hash sha-256 de 'AuditFlow@2025'
const DEFAULT_PASSWORD_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';

class StoreService {
  constructor() {
    // opcional: checar conexão ou dar init
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

        const user: User = {
            id: data.id,
            name: data.full_name,
            email: data.email,
            role: data.role,
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

  // --- usuários ---
  
  async getUsers(): Promise<User[]> {
    const { data, error } = await supabase.from('profiles').select('*');
    if (error) return [];
    
    return data.map((d: any) => ({
        id: d.id,
        name: d.full_name,
        email: d.email,
        role: d.role,
        managerId: d.manager_id,
        delegatedManagerId: d.delegated_manager_id,
        avatarUrl: `https://ui-avatars.com/api/?name=${d.full_name}`
    }));
  }

  async addUser(user: Omit<User, 'id'>): Promise<User | null> {
    const managerIdValue = (user.managerId && user.managerId.trim() !== '') ? user.managerId : null;
    
    const dbUser = {
        full_name: user.name,
        email: user.email.trim(),
        role: user.role,
        manager_id: managerIdValue,
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
        managerId: data.manager_id,
        avatarUrl: `https://ui-avatars.com/api/?name=${data.full_name}`
    };
  }

  async updateUser(id: string, data: Partial<User>) {
    const dbUpdate: any = {};
    if (data.name) dbUpdate.full_name = data.name;
    if (data.email) dbUpdate.email = data.email.trim();
    if (data.role) dbUpdate.role = data.role;
    
    if (data.managerId !== undefined) {
        dbUpdate.manager_id = (data.managerId && data.managerId.trim() !== '') ? data.managerId : null;
    }

    await supabase.from('profiles').update(dbUpdate).eq('id', id);
  }

  // --- delegação de equipe ---

  async delegateTeamManagement(managerId: string, delegatedManagerId: string): Promise<boolean> {
    const { error: delegError } = await supabase
        .from('profiles')
        .update({ delegated_manager_id: delegatedManagerId })
        .eq('id', managerId);
    
    if (delegError) return false;

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
        managerId: d.manager_id,
        delegatedManagerId: d.delegated_manager_id,
        avatarUrl: `https://ui-avatars.com/api/?name=${d.full_name}`
    }));
  }

  // --- projetos ---
  
  async getProjects(): Promise<Project[]> {
    const { data, error } = await supabase.from('projects').select('*');
    if (error) return [];

    return data.map((p: any) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        classification: p.classification,
        budgetedHours: p.budgeted_hours,
        active: p.active,
        allowedManagerIds: p.allowed_manager_ids || []
    }));
  }

  async addProject(project: Omit<Project, 'id'>) {
    const dbProject = {
        name: project.name,
        code: project.code,
        classification: project.classification,
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
    if (data.budgetedHours !== undefined) dbUpdate.budgeted_hours = data.budgetedHours;
    if (data.active !== undefined) dbUpdate.active = data.active;
    if (data.allowedManagerIds) dbUpdate.allowed_manager_ids = data.allowedManagerIds;

    await supabase.from('projects').update(dbUpdate).eq('id', id);
  }

  // --- lançamentos ---
  
  async getEntries(userId?: string): Promise<TimesheetEntry[]> {
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
      const normalizeDate = (value: any) => {
        if (!value) return null;
        if (value instanceof Date) return value.toISOString().split('T')[0];
        if (typeof value === 'string') {
          const match = value.match(/\d{4}-\d{2}-\d{2}/);
          return match ? match[0] : value.split('T')[0];
        }
        return null;
      };

      // usa work_date se tiver, senão cai no date
      const displayDate = normalizeDate(e.work_date) || normalizeDate(e.date) || '';

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

  async submitPeriod(userId: string, year: number, month: number) {
      // atualizado: busca user fresco pra pegar manager_id e delegated_manager_id do db
      // se o gestor delegou, usa delegated_manager_id pra aprovação
      
      const { data: userProfile, error: profileError } = await supabase
          .from('profiles')
          .select('manager_id, delegated_manager_id')
          .eq('id', userId)
          .single();

      if (profileError) {
          console.error("Erro ao buscar gestor para submissão:", profileError);
          throw new Error("Falha ao identificar seu gestor. Tente novamente.");
      }

      // se o gestor do user tem delegado, usa o delegado; senão usa o original
      let currentManagerId = userProfile?.delegated_manager_id || userProfile?.manager_id;
      
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
                manager_id: currentManagerId, // salva o gestor (ou delegado) no envio
                updated_at: new Date().toISOString(),
                rejection_reason: null
            }, {
                onConflict: 'user_id, year, month'
            })
            .select()
            .single();

          if (error) throw error;
          return data;

      } catch (e) {
          console.error("Critical Error in submitPeriod:", e);
          throw e;
      }
  }

  async approvePeriod(periodId: string) {
      const { error } = await supabase
        .from('timesheet_periods')
        .update({ status: 'APPROVED', updated_at: new Date().toISOString() })
        .eq('id', periodId);
      if (error) throw error;
  }

  async rejectPeriod(periodId: string, reason: string) {
      const { error } = await supabase
        .from('timesheet_periods')
        .update({ 
            status: 'REJECTED', 
            rejection_reason: reason,
            updated_at: new Date().toISOString() 
        })
        .eq('id', periodId);
      if (error) throw error;
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
          .select('id, full_name, email, avatar_url')
          .in('id', userIds);

      // 4. mapeia os resultados
      return periods.map((d: any) => {
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

  // --- helpers de analytics ---
  
  private isWorkingDay(d: Date, holidays: Holiday[], exceptions: CalendarException[]): boolean {
      const dateString = d.toISOString().split('T')[0];
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
  manager_id uuid references profiles(id),
  email text unique not null,
  password text
);

-- 3. Tabela de Projetos
create table if not exists projects (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  code text,
  classification text,
  budgeted_hours numeric default 0,
  active boolean default true,
  allowed_manager_ids text[], 
  created_at timestamp with time zone default timezone('utc'::text, now())
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

-- 6. Tabela de Períodos e Aprovações (NOVO)
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

-- 7. CRIAR USUÁRIO ADMIN (Senha padrão AuditFlow@2025 já no hash)
insert into profiles (full_name, email, role, password)
values ('Administrador', 'admin@auditflow.com', 'ADMIN', '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918')
on conflict (email) do nothing;

-- 8. GARANTIR PERMISSÕES E RECARREGAR CACHE (Fix para erros de 'table not found')
grant all on all tables in schema public to postgres, anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
`;