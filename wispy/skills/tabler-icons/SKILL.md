# Tabler Icons

5000+ pixel-perfect, free & open source icons. MIT licensed.
The primary icon library for all Wispy projects.

## Installation

### React / Next.js
```bash
npm install @tabler/icons-react
```

```tsx
import { IconHome, IconSettings, IconUser, IconSearch } from "@tabler/icons-react"

<IconHome size={24} stroke={1.5} />
<IconSettings size={20} stroke={2} className="text-muted-foreground" />
```

### HTML (CDN Webfont)
```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@latest/dist/tabler-icons.min.css">

<i class="ti ti-home"></i>
<i class="ti ti-settings"></i>
<i class="ti ti-user"></i>
```

### SVG Sprite
```bash
npm install @tabler/icons
```

## Common Icons by Category

### Navigation & UI
- `IconHome` / `ti-home` - Home/dashboard
- `IconMenu2` / `ti-menu-2` - Hamburger menu
- `IconX` / `ti-x` - Close/dismiss
- `IconChevronRight` / `ti-chevron-right` - Expand/navigate
- `IconArrowLeft` / `ti-arrow-left` - Back
- `IconSearch` / `ti-search` - Search
- `IconFilter` / `ti-filter` - Filter
- `IconSettings` / `ti-settings` - Settings
- `IconDots` / `ti-dots` - More options
- `IconExternalLink` / `ti-external-link` - External link

### User & Auth
- `IconUser` / `ti-user` - User profile
- `IconUsers` / `ti-users` - Team/group
- `IconLogin` / `ti-login` - Sign in
- `IconLogout` / `ti-logout` - Sign out
- `IconLock` / `ti-lock` - Security
- `IconShield` / `ti-shield` - Protection
- `IconKey` / `ti-key` - API key/password

### Commerce & Finance
- `IconWallet` / `ti-wallet` - Wallet
- `IconCreditCard` / `ti-credit-card` - Payment
- `IconCoin` / `ti-coin` - Currency/token
- `IconCash` / `ti-cash` - Money
- `IconReceipt` / `ti-receipt` - Receipt
- `IconChartBar` / `ti-chart-bar` - Analytics
- `IconChartLine` / `ti-chart-line` - Trends
- `IconChartPie` / `ti-chart-pie` - Distribution
- `IconTrendingUp` / `ti-trending-up` - Growth

### Development
- `IconCode` / `ti-code` - Code
- `IconTerminal` / `ti-terminal` - Terminal
- `IconBrandGithub` / `ti-brand-github` - GitHub
- `IconGitBranch` / `ti-git-branch` - Git branch
- `IconDatabase` / `ti-database` - Database
- `IconServer` / `ti-server` - Server
- `IconApi` / `ti-api` - API
- `IconBug` / `ti-bug` - Bug/debug
- `IconRocket` / `ti-rocket` - Deploy/launch
- `IconPackage` / `ti-package` - Package

### Content & Media
- `IconPhoto` / `ti-photo` - Image
- `IconVideo` / `ti-video` - Video
- `IconFile` / `ti-file` - File
- `IconFolder` / `ti-folder` - Folder
- `IconDownload` / `ti-download` - Download
- `IconUpload` / `ti-upload` - Upload
- `IconClipboard` / `ti-clipboard` - Copy
- `IconPencil` / `ti-pencil` - Edit
- `IconTrash` / `ti-trash` - Delete

### Communication
- `IconMail` / `ti-mail` - Email
- `IconMessage` / `ti-message` - Chat
- `IconBell` / `ti-bell` - Notification
- `IconPhone` / `ti-phone` - Phone
- `IconSend` / `ti-send` - Send
- `IconBrandTelegram` / `ti-brand-telegram` - Telegram
- `IconBrandWhatsapp` / `ti-brand-whatsapp` - WhatsApp
- `IconBrandSlack` / `ti-brand-slack` - Slack

### Status & Feedback
- `IconCheck` / `ti-check` - Success
- `IconAlertTriangle` / `ti-alert-triangle` - Warning
- `IconInfoCircle` / `ti-info-circle` - Info
- `IconCircleX` / `ti-circle-x` - Error
- `IconLoader` / `ti-loader` - Loading
- `IconRefresh` / `ti-refresh` - Refresh
- `IconEye` / `ti-eye` - View
- `IconEyeOff` / `ti-eye-off` - Hidden

### Blockchain & Web3
- `IconCurrencyBitcoin` / `ti-currency-bitcoin` - Bitcoin
- `IconCurrencyEthereum` / `ti-currency-ethereum` - Ethereum
- `IconBlockchain` / `ti-blockchain` - Blockchain
- `IconLink` / `ti-link` - Chain/link
- `IconFingerprint` / `ti-fingerprint` - Identity
- `IconLockSquare` / `ti-lock-square` - Smart contract

## Props (React)

```tsx
interface TablerIconProps {
  size?: number | string    // Default: 24
  stroke?: number           // Default: 2 (range: 0.5-3)
  color?: string            // CSS color
  className?: string        // Tailwind classes
}
```

## With shadcn/ui Button

```tsx
import { Button } from "@/components/ui/button"
import { IconPlus, IconDownload } from "@tabler/icons-react"

<Button><IconPlus size={16} className="mr-2" /> Add Item</Button>
<Button variant="outline"><IconDownload size={16} className="mr-2" /> Export</Button>
```

## Browse All Icons
Full searchable gallery: https://tabler.io/icons
