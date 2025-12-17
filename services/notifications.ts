
export const NotificationService = {
  // Solicita permissão ao usuário
  requestPermission: async () => {
    if (!('Notification' in window)) {
      console.log('Este navegador não suporta notificações de desktop');
      return false;
    }

    if (Notification.permission === 'granted') {
      return true;
    }

    const permission = await Notification.requestPermission();
    return permission === 'granted';
  },

  // Envia a notificação
  send: (title: string, body: string, tag?: string) => {
    if (Notification.permission === 'granted') {
      // Evita spam de notificações com a mesma tag
      // ex: não mandar aviso de "Lance suas horas" 10x seguidas
      new Notification(title, {
        body,
        icon: 'https://i.postimg.cc/bv4S9DFS/logo.png', // Tenta usar o logo se existir
        tag, // Tag única para substituir notificações antigas do mesmo tipo
        requireInteraction: false, // Fecha sozinha após alguns segundos
        silent: false
      });
    }
  }
};
