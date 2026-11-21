// Use the same download destination as Chatterly's existing web invitations.
export const APP_INVITE_LINK = 'https://chatterly.app/download';

export function withAppInviteLink(message: string): string {
  const text = message.trim();
  // Check the whole URL: a different path or a redirect containing our URL
  // must not suppress the actual app link. Keep existing referral links intact.
  const links = text.match(/https?:\/\/[^\s<>"']+/gi) || [];
  const hasAppLink = links.some(link => {
    const destination = link.replace(/[.,!?;:)\]}]+$/, '').split(/[?#]/)[0].replace(/\/$/, '');
    return destination === APP_INVITE_LINK;
  });
  return hasAppLink ? text : [text, APP_INVITE_LINK].filter(Boolean).join('\n');
}
