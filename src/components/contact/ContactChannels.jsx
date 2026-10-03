import { ArrowUpRight } from 'lucide-react'
import { AiOutlineInstagram, AiOutlineMail, AiOutlineWhatsApp, AiOutlineYoutube } from 'react-icons/ai'

const channels = [
  ['Email', 'ecell@abes.ac.in', 'mailto:ecell@abes.ac.in', AiOutlineMail],
  ['Instagram', '@ecell_abesec', 'https://www.instagram.com/ecell_abesec/', AiOutlineInstagram],
  ['WhatsApp', 'Join on WhatsApp', 'https://whatsapp.com/channel/0029VaEzRcf84Om7lps30D2F', AiOutlineWhatsApp],
  ['YouTube', 'E-Cell ABESEC', 'https://www.youtube.com/@E-CELL_ABESEC', AiOutlineYoutube],
]

function ContactChannels() {
  return (
    <div className="contact-channels">
      {channels.map(([label, value, href, Icon]) => <a key={label} href={href} target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noreferrer noopener' : undefined}><Icon aria-hidden="true" /><span><small>{label}</small><strong>{value}</strong></span><ArrowUpRight size={16} aria-hidden="true" /></a>)}
    </div>
  )
}

export default ContactChannels
