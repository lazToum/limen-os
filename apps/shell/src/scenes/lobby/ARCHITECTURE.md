# Waldiez Experience Architecture

## Overview

The Waldiez experience follows a layered navigation structure:

```
Landing Page (Calligraphy Animation)
    ↓ [Enter]
The Void (Meta-Lobby / Hub)
    ↓ [Select Portal]
Themed Lobby (Celestial / Gallery / Islands / Tree)
    ↓ [Select Experience]
Actual Experience / Content
```

---

## Current Status: ✅ Complete

All core lobby components have been implemented and are functional.

| Component | Status | Description |
|-----------|--------|-------------|
| Landing Page | ✅ Done | Calligraphy animation, particles, enter portal |
| The Void | ✅ Done | Meta-lobby with 4 geometric portals |
| Celestial Observatory | ✅ Done | Orbiting planets, starfield, nebula |
| Gallery Hall | ✅ Done | Marble corridor, WASD navigation |
| Floating Islands | ✅ Done | Light bridges, fog, aurora |
| Tree of Experiences | ✅ Done | Glowing tree, fireflies, falling leaves |
| Navigation Flow | ✅ Done | Void ↔ Themed Lobby transitions |
| Keyboard Support | ✅ Done | Enter, Escape, scroll, WASD |
| Sticky Hover | ✅ Done | Unhover delay, expanded hitboxes |

---

## Navigation Flow

### 1. Landing Page
Cinematic entry with calligraphy animation revealing "Waldiez" and tagline.
- Elegant typography (Playfair Display)
- Floating particles
- "Enter" portal button with glow effects

### 2. The Void (Meta-Lobby)
A minimalist dark space with 4 geometric portals arranged in a cross pattern:

| Portal | Shape | Color | Theme | Description |
|--------|-------|-------|-------|-------------|
| ⬆️ Top | Octahedron | Purple | Celestial | Data & Analytics |
| ⬅️ Left | Dodecahedron | Gold | Gallery | Creative Tools |
| ➡️ Right | Icosahedron | Teal | Islands | World Building |
| ⬇️ Bottom | Torus | Green | Tree | Learning & Docs |

### 3. Themed Lobbies

Each portal leads to a unique themed environment:

#### 🌌 Celestial Observatory
**Mood:** Cosmic wonder, infinite possibility
**Colors:** Deep space blues, purple nebulas, golden starlight
**Features:**
- Circular platform at center
- Portals orbit like planets
- Starfield with twinkling stars
- Nebula clouds in background
**Best for:** Sensor data, analytics, dashboards

#### 🏛️ Gallery Hall
**Mood:** Refined elegance, artistic sophistication  
**Colors:** Warm marble, gold accents, soft rose
**Features:**
- Elegant corridor with pillars
- Archway portals on both sides
- WASD navigation (first-person)
- Spotlights illuminate each portal
**Best for:** Media creation, image galleries, portfolios

#### 🏝️ Floating Islands
**Mood:** Mystical adventure, dreamlike wonder
**Colors:** Ethereal teals, misty purples, aurora greens
**Features:**
- Central island with surrounding floating islands
- Light bridges connecting islands
- Fog below, aurora above
- Gentle bobbing animation
**Best for:** Story building, world design, adventures

#### 🌳 Tree of Experiences
**Mood:** Organic growth, natural wisdom
**Colors:** Forest greens, warm amber, bioluminescent blue
**Features:**
- Massive glowing tree at center
- Branches lead to portals (glowing orbs)
- Fireflies floating around
- Falling leaves animation
**Best for:** Tutorials, documentation, learning paths

---

## File Structure

```
examples/lobby/
├── App.tsx                    # Main app orchestrating all screens
├── Landing.tsx                # Landing page with calligraphy
├── landing.css
├── Void.tsx                   # The Void (meta-lobby)
├── void.css
├── void.config.ts             # Void portals & settings
├── voidScene.ts               # Babylon.js void scene
├── themes/
│   ├── index.ts               # Barrel exports
│   ├── themes.config.ts       # All theme configs
│   ├── ThemedLobby.tsx        # Generic themed lobby component
│   ├── themedLobby.css        # Shared themed lobby styles
│   ├── celestialScene.ts      # Celestial Observatory
│   ├── galleryScene.ts        # Gallery Hall
│   ├── islandsScene.ts        # Floating Islands
│   └── treeScene.ts           # Tree of Experiences
├── index.ts                   # Main exports
├── index.tsx                  # Entry point
└── ARCHITECTURE.md            # This file
```

---

## Design Language

### Colors

| Element | Color | Hex |
|---------|-------|-----|
| Void Background | Near Black | `#010102` |
| Text Primary | Warm White | `#f5f5f0` |
| Celestial Accent | Soft Purple | `#9989ff` |
| Gallery Accent | Warm Gold | `#d4b896` |
| Islands Accent | Ethereal Teal | `#4de8d8` |
| Tree Accent | Vibrant Green | `#66e650` |

### Typography

- **Display:** Playfair Display (elegant, serif)
- **Body:** Inter (clean, readable)
- **Code/Keys:** SF Mono, Monaco (monospace)

### Animation Principles

- **Slow & Graceful:** Nothing jarring, everything breathes
- **Purposeful:** Animations guide attention
- **Responsive:** Immediate feedback on interactions
- **Smooth Transitions:** 500-800ms easing

---

## Interaction Design

### Hover Behavior
- **Hitbox Expansion:** 1.8x larger than visual (easier to target)
- **Unhover Delay:** 250ms grace period (prevents jitter)
- **Focus Effect:** Non-hovered portals dim to 25% opacity
- **Scale Animation:** Hovered portal scales up 1.35x

### Camera Behavior
- **Default Distance:** 10 units
- **Focus Distance:** 4.5 units (zooms in significantly)
- **Inertia:** 0.92 (smooth deceleration)
- **Target Following:** Camera targets hovered portal

### Keyboard Navigation
| Key | Void | Themed Lobbies |
|-----|------|----------------|
| Enter/Space | Select portal | Select experience |
| Escape | Reset view | Return to Void |
| Scroll | Zoom | Zoom |
| WASD | - | Walk (Gallery only) |

---

## Technical Notes

### State Management
```typescript
type AppScreen = 
  | { type: 'landing' }
  | { type: 'void' }
  | { type: 'themed-lobby'; theme: LobbyTheme };
```

### Experience Configuration
```typescript
interface Experience {
  id: string;
  name: string;
  description: string;
  portalShape: PortalShape;
  color: Color3;
  emissiveColor: Color3;
  position: Vector3;
  lobbyTheme?: LobbyTheme;  // Opens themed lobby
  scriptPath?: string;       // Direct script loading
}
```

### Scene Callbacks Pattern
All Babylon scenes follow a consistent callback pattern:
```typescript
interface SceneCallbacks {
  onExperienceHover: (exp: Experience | null) => void;
  onExperienceSelect: (exp: Experience) => void;
  onSceneReady: () => void;
  onBackToVoid?: () => void;  // For themed lobbies
}
```

---

## Future Enhancements

### High Priority
- [ ] Sound design (ambient loops, interaction sounds)
- [ ] Portal preview system (peek inside before entering)
- [ ] Mobile touch controls

### Medium Priority
- [ ] Saved preferences (last visited lobby)
- [ ] Custom portal colors/themes
- [ ] Transition animations between lobbies

### Low Priority
- [ ] VR mode support
- [ ] Multiplayer presence
- [ ] User-generated lobbies

---

## Running the Demo

```bash
cd packages/player
bun dev
# Opens at http://localhost:5174
```

Click "Enter" on the landing page, then explore the Void and themed lobbies!
