# shadcn/ui Component Library

Complete reference for building UIs with shadcn/ui -- the default component library for Wispy projects.

## Setup

```bash
npx shadcn@latest init -y --defaults
```

## All Components (50+)

Install any component:
```bash
npx shadcn@latest add [component-name]
```

### Layout Components
- **accordion** - Collapsible content sections
- **aspect-ratio** - Maintain aspect ratios for media
- **card** - Container with header, content, footer
- **collapsible** - Toggle visibility of content
- **resizable** - Resizable panel groups
- **scroll-area** - Custom scrollbar styling
- **separator** - Visual divider (horizontal/vertical)
- **sheet** - Slide-out panel from screen edge
- **drawer** - Bottom sheet / mobile drawer

### Navigation
- **breadcrumb** - Navigation trail
- **dropdown-menu** - Floating menu on trigger click
- **menubar** - Horizontal menu with submenus
- **navigation-menu** - Site navigation with mega-menu support
- **pagination** - Page navigation controls
- **tabs** - Tabbed content sections
- **context-menu** - Right-click menu

### Form Controls
- **button** - Click actions (variants: default, destructive, outline, secondary, ghost, link)
- **checkbox** - Boolean toggle with label
- **form** - React Hook Form + Zod validation wrapper
- **input** - Text input field
- **input-otp** - One-time password input
- **label** - Form field labels
- **radio-group** - Single selection from options
- **select** - Dropdown selection
- **slider** - Range input
- **switch** - Toggle on/off
- **textarea** - Multi-line text input
- **toggle** - Pressed/unpressed state
- **toggle-group** - Multiple toggles as a group

### Data Display
- **avatar** - User profile image with fallback
- **badge** - Status indicators and tags
- **calendar** - Date picker calendar grid
- **chart** - Recharts wrapper (bar, line, area, pie, radar, radial)
- **data-table** - TanStack Table with sorting, filtering, pagination
- **hover-card** - Content shown on hover
- **progress** - Progress bar indicator
- **skeleton** - Loading placeholder
- **table** - HTML table with styling

### Feedback
- **alert** - Informational banners (default, destructive)
- **alert-dialog** - Confirmation modal requiring action
- **dialog** - Modal overlay
- **popover** - Floating content anchored to trigger
- **sonner** - Toast notifications (success, error, info)
- **toast** - Notification messages
- **tooltip** - Hover text hints

### Utility
- **carousel** - Scrollable content slides
- **command** - Command palette (Ctrl+K style)
- **date-picker** - Date selection with calendar

## Quick Patterns

### Dashboard Layout
```tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Progress } from "@/components/ui/progress"
```

### Form with Validation
```tsx
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
```

### Sidebar Navigation
```tsx
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { NavigationMenu, NavigationMenuItem, NavigationMenuLink, NavigationMenuList } from "@/components/ui/navigation-menu"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
```

### Data Table with Actions
```tsx
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
```

### Command Palette
```tsx
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
```

## Theming

shadcn uses CSS variables for theming. Default dark mode:
```css
.dark {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --primary: 210 40% 98%;
  --primary-foreground: 222.2 47.4% 11.2%;
  --muted: 217.2 32.6% 17.5%;
  --accent: 217.2 32.6% 17.5%;
}
```

Toggle dark mode:
```tsx
import { useTheme } from "next-themes"
const { theme, setTheme } = useTheme()
<Button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>Toggle</Button>
```

## cn() Utility
Always use `cn()` for conditional classes:
```tsx
import { cn } from "@/lib/utils"
<div className={cn("base-class", isActive && "active-class", className)} />
```

## Batch Install (Common Sets)

Dashboard:
```bash
npx shadcn@latest add card table tabs avatar badge progress skeleton separator dropdown-menu chart
```

Forms:
```bash
npx shadcn@latest add form input label select checkbox switch slider textarea radio-group button
```

Navigation:
```bash
npx shadcn@latest add navigation-menu breadcrumb tabs sheet dropdown-menu command
```

All components:
```bash
npx shadcn@latest add accordion alert alert-dialog aspect-ratio avatar badge breadcrumb button calendar card carousel chart checkbox collapsible command context-menu data-table date-picker dialog drawer dropdown-menu form hover-card input input-otp label menubar navigation-menu pagination popover progress radio-group resizable scroll-area select separator sheet skeleton slider sonner switch table tabs textarea toast toggle toggle-group tooltip
```
