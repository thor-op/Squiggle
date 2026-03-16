export function getPlayerId(): string {
  if (typeof window === 'undefined') return '';
  let id = sessionStorage.getItem('playerId');
  if (!id) {
    id = 'player_' + Math.random().toString(36).substring(2, 9);
    sessionStorage.setItem('playerId', id);
  }
  return id;
}

export function getPlayerProfile() {
  if (typeof window === 'undefined') return { name: '', avatarId: '1' };
  return {
    name: sessionStorage.getItem('playerName') || '',
    avatarId: sessionStorage.getItem('playerAvatar') || '1'
  };
}

export function setPlayerProfile(name: string, avatarId: string) {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem('playerName', name);
  sessionStorage.setItem('playerAvatar', avatarId);
}

export function generateRoomId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
