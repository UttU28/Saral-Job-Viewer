# Saral Job Viewer

## Overview

Saral Job Viewer is a modern, mobile-first React/TypeScript application designed to view and manage LinkedIn job scraping results. The application provides a comprehensive job listing viewer with search, filtering, and keyword management capabilities, built with a focus on productivity and data-dense content presentation.

The application features a dark-themed, responsive interface optimized for both mobile and desktop users, allowing them to efficiently browse job postings, filter by time periods, manage search keywords, and blacklist companies.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework & Build System:**
- React 18 with TypeScript for type-safe component development
- Vite as the build tool and development server for fast HMR and optimized production builds
- Wouter for lightweight client-side routing
- Mobile-first responsive design philosophy

**UI Component System:**
- Shadcn/ui component library (New York style variant) for consistent, accessible UI components
- Radix UI primitives for headless, accessible component foundations
- Tailwind CSS for utility-first styling with custom dark theme configuration
- CSS variables-based theming system supporting light/dark modes

**State Management:**
- TanStack Query (React Query) for server state management, caching, and data synchronization
- React hooks for local component state
- Context API for theme management

**Design System:**
- Custom dark-themed design optimized for productivity
- HSL-based color system with semantic color tokens
- Touch-friendly interactions with 44px minimum touch targets
- System font stack for optimal cross-platform rendering

### Backend Architecture

**Server Framework:**
- Express.js server with TypeScript
- RESTful API design pattern
- In-development Vite middleware integration for HMR

**Data Layer:**
- Drizzle ORM for type-safe database operations
- PostgreSQL database (configured via Neon serverless driver)
- Schema-first database design with Zod validation
- In-memory storage implementation for development/testing

**API Design:**
- Resource-based REST endpoints (`/api/getAllJobs`, `/api/getKeywords`, etc.)
- Request/response validation using Zod schemas
- Centralized error handling middleware
- Request logging for debugging

### Data Models

**Job Schema:**
- Core fields: id, title, companyName, location, jobType, applied status
- Temporal data: timestamp for time-based filtering
- External linking: LinkedIn job post URLs
- AI processing: optional AI tags and processing flags

**Keyword Schema:**
- Dual-purpose keyword system:
  - SearchList: Job title keywords for LinkedIn scraping
  - NoCompany: Company blacklist entries
- Auto-generated timestamps for tracking

### State Management Strategy

**Server State (TanStack Query):**
- Automatic background refetching disabled (staleTime: Infinity)
- Manual refetch control for user-initiated updates
- Optimistic UI updates for keyword management
- Centralized fetch wrapper with error handling

**Client State:**
- Local search query state for real-time filtering
- Time filter state for temporal job filtering
- Modal visibility state for UI interactions
- Theme preference persisted to localStorage

### Authentication & Session Management

Currently implements session infrastructure:
- connect-pg-simple for PostgreSQL session storage
- Session configuration prepared but not actively enforced
- Ready for future authentication implementation

### Build & Deployment

**Development:**
- Separate client/server development processes
- Vite HMR for instant frontend updates
- tsx for TypeScript execution in development
- Path aliases configured for clean imports (@, @shared, @assets)

**Production Build:**
- Client: Vite builds optimized React bundle to dist/public
- Server: esbuild bundles Node.js server to dist/index.js
- ESM module format throughout the stack
- Tree-shaking and code-splitting enabled

## External Dependencies

### Core Framework Dependencies
- **@tanstack/react-query** (v5.60.5) - Server state management and caching
- **express** - Node.js web application framework
- **react** & **react-dom** - UI library
- **wouter** - Lightweight client-side routing

### Database & ORM
- **drizzle-orm** (v0.39.1) - TypeScript ORM for PostgreSQL
- **@neondatabase/serverless** (v0.10.4) - Neon PostgreSQL serverless driver
- **drizzle-kit** - Database migrations and schema management
- **connect-pg-simple** (v10.0.0) - PostgreSQL session store

### UI Component Libraries
- **@radix-ui/react-*** - Comprehensive set of headless UI primitives (accordion, dialog, dropdown, select, etc.)
- **tailwindcss** - Utility-first CSS framework
- **class-variance-authority** - Type-safe variant styling
- **cmdk** - Command menu component

### Form & Validation
- **react-hook-form** - Form state management
- **@hookform/resolvers** (v3.10.0) - Form validation resolvers
- **zod** - TypeScript-first schema validation
- **drizzle-zod** - Zod schema generation from Drizzle

### Development Tools
- **vite** - Build tool and dev server
- **typescript** - Type system
- **tsx** - TypeScript execution for Node.js
- **esbuild** - Fast JavaScript bundler (for server build)
- **@replit/vite-plugin-*** - Replit-specific development plugins

### Utility Libraries
- **date-fns** (v3.6.0) - Date manipulation
- **clsx** & **tailwind-merge** - Conditional className utilities
- **embla-carousel-react** - Carousel component
- **lucide-react** - Icon library