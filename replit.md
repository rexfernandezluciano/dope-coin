# Dope Coin - Stellar Blockchain Cryptocurrency Platform

## Overview
This is a decentralized social cryptocurrency platform built on the Stellar blockchain. The application features a full-stack TypeScript architecture with React frontend and Express backend, designed to be fast, efficient, and user-friendly.

## Recent Changes (September 22, 2025)
- ✅ Successfully imported GitHub project into Replit environment
- ✅ Installed missing dependencies (tsx)
- ✅ Configured development workflow on port 5000 with webview output
- ✅ Verified Stellar blockchain integration is working (accounts funded via friendbot)
- ✅ Configured deployment settings for autoscale deployment
- ✅ Application is running successfully and responding on port 5000

## Project Architecture

### Frontend (React + TypeScript)
- **Location**: `client/src/`
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter for client-side routing
- **UI Components**: Radix UI with shadcn/ui styling
- **Styling**: Tailwind CSS with custom theming
- **State Management**: TanStack Query for server state
- **Build Tool**: Vite with custom configuration

### Backend (Express + TypeScript)
- **Location**: `server/`
- **Framework**: Express.js with TypeScript
- **Runtime**: tsx for development, built for production
- **Database**: Drizzle ORM with PostgreSQL support
- **Authentication**: JWT + Passport.js with local strategy
- **Blockchain**: Stellar SDK integration for cryptocurrency operations

### Key Features
- Stellar blockchain integration for DOPE coin management
- User authentication and profile management
- Wallet functionality (send/receive/mining)
- Trading and limit order capabilities
- Real-time network statistics
- Referral system
- Email notifications via SendGrid integration

### Environment Configuration
- **Development**: Runs on port 5000 with hot reload via Vite
- **Host Configuration**: Properly configured for Replit proxy with `allowedHosts: true`
- **Production**: Autoscale deployment with built static assets

### Database Integration
- Uses Replit's built-in PostgreSQL database
- SendGrid integration available for email services
- Drizzle ORM for type-safe database operations

## Development Workflow
- `npm run dev` - Start development server
- `npm run build` - Build production assets
- `npm run start` - Start production server
- `npm run db:push` - Push database schema changes

## Current Status
✅ **Ready for Development** - Application is fully configured and running in Replit environment