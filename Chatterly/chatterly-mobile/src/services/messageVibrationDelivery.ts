import type {VibrationPattern} from './notificationPreferencesApi';
import {vibrateNotification} from './notificationVibration';
type Receipt = {id?: string; chatId?: string; body: string};
type Source = 'socket' | 'push';
const recent: Array<Receipt & {source: Source; at: number; paired: boolean}> = [];
/** A live socket receipt and its later push represent one alert, not two. */
export function vibrateMessageOnce(source: Source, receipt: Receipt, mode: VibrationPattern): void {
  if (mode === 'Turned Off') return;
  const now = Date.now();
  while (recent.length && (now - recent[0].at > 30000 || recent.length >= 256)) recent.shift();
  if (receipt.id && recent.some(item => item.id === receipt.id)) return;
  // Older pushes have no message id/chat id. Match one opposite-source receipt
  // by its preview only within a short delivery window; never merge two sockets.
  const counterpart = receipt.body && recent.find(item => !item.paired && item.source !== source &&
    now - item.at < 5000 && item.body === receipt.body &&
    (!item.chatId || !receipt.chatId || item.chatId === receipt.chatId));
  if (counterpart) {
    counterpart.paired = true;
    recent.push({...receipt, source, at: now, paired: true});
    return;
  }
  recent.push({...receipt, source, at: now, paired: false});
  vibrateNotification(mode);
}
