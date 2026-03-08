/**
 * Zimbabwe Central Africa Time (CAT = UTC+2)
 */
export function getCATDate(): Date {
  const now = new Date();
  // Get UTC time and add 2 hours for CAT
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  return new Date(utc + 2 * 3600000);
}

export function getCATGreeting(): string {
  const catHour = getCATDate().getHours();
  if (catHour >= 5 && catHour < 12) return 'Good morning';
  if (catHour >= 12 && catHour < 17) return 'Good afternoon';
  if (catHour >= 17 && catHour < 21) return 'Good evening';
  return 'Good night';
}

export function formatCATTime(): string {
  const cat = getCATDate();
  return cat.toLocaleTimeString('en-ZW', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
}
