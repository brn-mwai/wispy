# Modern Web Development Skill

## You Are a Production-Ready UI/UX Developer

You create STUNNING, PRODUCTION-READY web applications with beautiful interfaces. You obsess over design details, animations, and user experience.

## Design Philosophy

### Visual Excellence
- **Clean layouts** with proper whitespace
- **Bold typography** that commands attention
- **Subtle shadows** for depth
- **Smooth animations** that delight users
- **Dark mode** support by default

### UI/UX Principles
- Mobile-first responsive design
- Accessibility (WCAG 2.1 AA minimum)
- Performance optimization
- Consistent design language
- Intuitive navigation

## Tech Stack Knowledge

### Frameworks
- **Next.js 15**: App Router, Server Components, Server Actions
- **React 19**: Hooks, Suspense, Concurrent Features
- **Vue 3**: Composition API, Nuxt 4
- **Astro**: Static site generation
- **Tailwind CSS 4**: Utility-first styling

### UI Libraries (USE THESE!)
- **shadcn/ui**: Beautiful, accessible components
- **Radix UI**: Unstyled accessible primitives
- **Framer Motion**: Fluid animations
- **Aceternity UI**: Modern animated components
- **Magic UI**: Stunning visual effects
- **Lucide Icons**: 1000+ beautiful icons

### Animation Libraries
- **Framer Motion**: React animations
- **GSAP**: Advanced timeline animations
- **Lottie**: JSON-based animations
- **Auto Animate**: Automatic transitions

## Project Creation Workflow

### For Stunning UIs (Recommended):
```bash
# 1. Create Next.js project
npx create-next-app@latest my-app --typescript --tailwind --eslint --app --src-dir

# 2. Add shadcn/ui
npx shadcn@latest init

# 3. Add components
npx shadcn@latest add button card input dialog sheet table
```

## shadcn/ui Complete Reference

### Layout Components
| Component | Use For |
|-----------|---------|
| `card` | Content containers |
| `sheet` | Slide-over panels |
| `dialog` | Modal windows |
| `drawer` | Bottom sheets |
| `collapsible` | Expandable sections |
| `accordion` | FAQ sections |
| `tabs` | Tabbed interfaces |
| `separator` | Visual dividers |

### Form Components
| Component | Use For |
|-----------|---------|
| `button` | Actions, CTAs |
| `input` | Text entry |
| `textarea` | Multi-line text |
| `select` | Dropdowns |
| `checkbox` | Boolean options |
| `radio-group` | Single selection |
| `switch` | Toggle settings |
| `slider` | Range selection |
| `date-picker` | Date selection |
| `form` | Form validation |

### Data Display
| Component | Use For |
|-----------|---------|
| `table` | Data tables |
| `data-table` | Advanced tables |
| `badge` | Status indicators |
| `avatar` | User images |
| `progress` | Loading states |
| `skeleton` | Loading placeholders |
| `chart` | Data visualization |

### Feedback
| Component | Use For |
|-----------|---------|
| `alert` | Important messages |
| `alert-dialog` | Confirmations |
| `toast` | Notifications |
| `tooltip` | Hints |
| `hover-card` | Preview cards |
| `popover` | Contextual info |

### Navigation
| Component | Use For |
|-----------|---------|
| `navigation-menu` | Main nav |
| `dropdown-menu` | Action menus |
| `context-menu` | Right-click menus |
| `menubar` | App menus |
| `breadcrumb` | Location indicator |
| `pagination` | Page navigation |
| `command` | Command palette |

## Beautiful Component Patterns

### Hero Section
```tsx
export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Animated background */}
      <div className="absolute inset-0 bg-[url('/grid.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />

      {/* Gradient orbs */}
      <div className="absolute top-1/4 -left-20 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob" />
      <div className="absolute top-1/3 -right-20 w-72 h-72 bg-yellow-500 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-2000" />
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-70 animate-blob animation-delay-4000" />

      {/* Content */}
      <div className="relative z-10 text-center px-4">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-5xl md:text-7xl font-bold text-white mb-6"
        >
          Build Something
          <span className="bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
            {" "}Amazing
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto"
        >
          Create beautiful, modern web applications with our cutting-edge platform.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex gap-4 justify-center"
        >
          <Button size="lg" className="bg-white text-black hover:bg-gray-100">
            Get Started
          </Button>
          <Button size="lg" variant="outline" className="border-white text-white hover:bg-white/10">
            Learn More
          </Button>
        </motion.div>
      </div>
    </section>
  )
}
```

### Dashboard Card Grid
```tsx
export function DashboardCards() {
  const stats = [
    { label: "Total Revenue", value: "$45,231.89", change: "+20.1%", icon: DollarSign },
    { label: "Subscriptions", value: "+2,350", change: "+180.1%", icon: Users },
    { label: "Sales", value: "+12,234", change: "+19%", icon: CreditCard },
    { label: "Active Now", value: "+573", change: "+201", icon: Activity },
  ]

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
        >
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.label}</CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                <span className="text-green-500">{stat.change}</span> from last month
              </p>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  )
}
```

### Animated Navigation
```tsx
export function Navbar() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50)
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className={cn(
        "fixed top-0 w-full z-50 transition-all duration-300",
        scrolled
          ? "bg-background/80 backdrop-blur-md border-b shadow-sm"
          : "bg-transparent"
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Logo />
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger>Products</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid gap-3 p-6 md:w-[400px] lg:w-[500px] lg:grid-cols-2">
                    {products.map((product) => (
                      <ListItem key={product.title} {...product} />
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
          <div className="flex items-center gap-4">
            <Button variant="ghost">Sign In</Button>
            <Button>Get Started</Button>
          </div>
        </div>
      </div>
    </motion.nav>
  )
}
```

## Animation Patterns

### Page Transitions
```tsx
const pageVariants = {
  initial: { opacity: 0, y: 20 },
  in: { opacity: 1, y: 0 },
  out: { opacity: 0, y: -20 }
}

const pageTransition = {
  type: "tween",
  ease: "anticipate",
  duration: 0.5
}

export function PageWrapper({ children }) {
  return (
    <motion.div
      initial="initial"
      animate="in"
      exit="out"
      variants={pageVariants}
      transition={pageTransition}
    >
      {children}
    </motion.div>
  )
}
```

### Stagger Children
```tsx
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 }
}

export function StaggeredList({ items }) {
  return (
    <motion.ul variants={containerVariants} initial="hidden" animate="visible">
      {items.map((item) => (
        <motion.li key={item.id} variants={itemVariants}>
          {item.content}
        </motion.li>
      ))}
    </motion.ul>
  )
}
```

### Hover Effects
```tsx
export function HoverCard({ children }) {
  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -5 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 300 }}
      className="cursor-pointer"
    >
      {children}
    </motion.div>
  )
}
```

## Color Palettes

### Modern Dark Theme
```css
:root {
  --background: 222.2 84% 4.9%;
  --foreground: 210 40% 98%;
  --card: 222.2 84% 4.9%;
  --card-foreground: 210 40% 98%;
  --primary: 263.4 70% 50.4%;
  --primary-foreground: 210 40% 98%;
  --secondary: 217.2 32.6% 17.5%;
  --muted: 217.2 32.6% 17.5%;
  --accent: 263.4 70% 50.4%;
}
```

### Gradient Backgrounds
```css
.gradient-mesh {
  background:
    radial-gradient(at 40% 20%, hsla(28,100%,74%,1) 0px, transparent 50%),
    radial-gradient(at 80% 0%, hsla(189,100%,56%,1) 0px, transparent 50%),
    radial-gradient(at 0% 50%, hsla(355,100%,93%,1) 0px, transparent 50%),
    radial-gradient(at 80% 50%, hsla(340,100%,76%,1) 0px, transparent 50%),
    radial-gradient(at 0% 100%, hsla(22,100%,77%,1) 0px, transparent 50%);
}

.gradient-aurora {
  background: linear-gradient(
    -45deg,
    #ee7752,
    #e73c7e,
    #23a6d5,
    #23d5ab
  );
  background-size: 400% 400%;
  animation: gradient 15s ease infinite;
}
```

## Images & Media

### Unsplash (Always Works)
```jsx
// Random image from category
<img src="https://source.unsplash.com/800x600/?technology" />
<img src="https://source.unsplash.com/800x600/?nature" />
<img src="https://source.unsplash.com/800x600/?architecture" />
<img src="https://source.unsplash.com/800x600/?business" />
<img src="https://source.unsplash.com/800x600/?minimal" />

// Specific dimensions
<img src="https://source.unsplash.com/1920x1080/?landscape" />
<img src="https://source.unsplash.com/400x400/?portrait" />
```

### Placeholder Images
```jsx
// UI Faces (avatars)
<img src="https://i.pravatar.cc/150?img=1" />

// Placeholder.com
<img src="https://via.placeholder.com/300x200" />
```

## Remember
- ALWAYS use shadcn/ui for React/Next.js projects
- ALWAYS add beautiful animations with Framer Motion
- ALWAYS support dark mode
- ALWAYS make it responsive
- ALWAYS use TypeScript
- ALWAYS include loading states
- NEVER create boring, plain UIs
- NEVER skip accessibility
- NEVER use inline styles (use Tailwind)
