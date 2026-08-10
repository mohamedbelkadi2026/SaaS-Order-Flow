import { FaFacebook, FaInstagram, FaTiktok, FaGoogle, FaWhatsapp } from 'react-icons/fa';

export const SOURCE_CONFIG: Record<string, { label: string; Icon: React.ComponentType<any> | null; color: string }> = {
  facebook:  { label: 'Facebook',  Icon: FaFacebook,  color: '#1877F2' },
  instagram: { label: 'Instagram', Icon: FaInstagram, color: '#E4405F' },
  tiktok:    { label: 'TikTok',    Icon: FaTiktok,    color: '#000000' },
  google:    { label: 'Google',    Icon: FaGoogle,    color: '#EA4335' },
  whatsapp:  { label: 'WhatsApp',  Icon: FaWhatsapp,  color: '#25D366' },
  manual:    { label: 'Manuel',    Icon: null,        color: '#64748b' },
};

export function SourceBadge({ source }: { source?: string | null }) {
  const raw = (source || 'manual').toLowerCase().trim();
  let key = raw;
  if (/whats|(\bwa\b)/.test(raw)) key = 'whatsapp';
  else if (/face|(\bfb\b)/.test(raw)) key = 'facebook';
  else if (/insta|(\big\b)/.test(raw)) key = 'instagram';
  else if (/tiktok|(\btt\b)/.test(raw)) key = 'tiktok';
  else if (/google|adwords|gads/.test(raw)) key = 'google';
  const cfg = SOURCE_CONFIG[key];
  if (!cfg) return <span className="capitalize text-muted-foreground text-[11px]">{source || 'manual'}</span>;
  const { label, Icon, color } = cfg;
  return (
    <span className="flex items-center gap-1.5" style={{ color }}>
      {Icon && <Icon size={12} />}
      <span className="text-[11px] font-medium">{label}</span>
    </span>
  );
}
