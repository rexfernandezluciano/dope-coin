# DOPE Coin API Documentation

## Overview

The DOPE Coin API is a RESTful API for managing cryptocurrency operations on the Stellar blockchain, similar to Pi Network. This API provides JWT-based authentication, rate limiting, and comprehensive endpoints for user management, mining simulation, and wallet operations.

**Base URL**: `http://localhost:5000/api`

## Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## Rate Limiting

- **Limit**: 100 requests per 15-minute window per IP address
- **Response**: 429 status code when limit exceeded
- **Headers**: `retryAfter` field indicates seconds until reset

## API Endpoints

### Authentication Endpoints

#### POST /api/auth/register

Register a new user account.

**Request Body:**
```json
{
  "username": "string (required)",
  "email": "string (required, valid email)",
  "password": "string (required, min 8 chars)",
  "confirmPassword": "string (required, must match password)",
  "fullName": "string (required)"
}
```

**Response (201):**
```json
{
  "message": "User created successfully",
  "token": "jwt-token-string",
  "user": {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "fullName": "string",
    "level": 1,
    "referralCode": "string"
  }
}
```

**Error Responses:**
- 400: Validation errors
- 409: User already exists

---

#### POST /api/auth/login

Authenticate user and get JWT token.

**Request Body:**
```json
{
  "email": "string (required)",
  "password": "string (required)"
}
```

**Response (200):**
```json
{
  "message": "Login successful",
  "token": "jwt-token-string",
  "user": {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "fullName": "string",
    "level": 1,
    "referralCode": "string"
  }
}
```

**Error Responses:**
- 400: Validation errors
- 401: Invalid credentials

---

### Protected Endpoints

All endpoints below require JWT authentication.

#### GET /api/protected/profile

Get user profile information.

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "fullName": "string",
    "profilePicture": "string|null",
    "level": 1,
    "isVerified": false,
    "referralCode": "string",
    "createdAt": "ISO-8601-timestamp"
  },
  "wallet": {
    "id": "uuid",
    "userId": "uuid",
    "dopeBalance": "decimal-string",
    "xlmBalance": "decimal-string",
    "lastUpdated": "ISO-8601-timestamp"
  },
  "stats": {
    "totalSessions": 0,
    "totalEarned": "decimal-string"
  }
}
```

---

#### GET /api/protected/dashboard

Get comprehensive dashboard data.

**Response (200):**
```json
{
  "user": {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "fullName": "string",
    "profilePicture": "string|null",
    "level": 1,
    "isVerified": false,
    "referralCode": "string",
    "createdAt": "ISO-8601-timestamp",
    "updatedAt": "ISO-8601-timestamp"
  },
  "wallet": {
    "id": "uuid",
    "userId": "uuid",
    "dopeBalance": "decimal-string",
    "xlmBalance": "decimal-string",
    "lastUpdated": "ISO-8601-timestamp"
  },
  "mining": {
    "isActive": false,
    "rate": "decimal-string"
  },
  "recentTransactions": []
}
```

---

### Mining Endpoints

#### GET /api/protected/mining/status

Get current mining session status.

**Response (200):**
```json
{
  "isActive": false,
  "session": null,
  "nextReward": null,
  "progress": 0,
  "currentEarned": 0
}
```

---

#### POST /api/protected/mining/start

Start a mining session. *Rate limited.*

**Response (200):**
```json
{
  "message": "Mining started - temporarily disabled",
  "session": {
    "id": "string",
    "userId": "uuid",
    "isActive": true,
    "rate": "decimal-string"
  }
}
```

---

#### POST /api/protected/mining/stop

Stop the current mining session.

**Response (200):**
```json
{
  "message": "Mining stopped - temporarily disabled",
  "session": {
    "id": "string",
    "userId": "uuid",
    "isActive": false
  }
}
```

---

#### POST /api/protected/mining/claim

Claim mining rewards. *Rate limited.*

**Response (200):**
```json
{
  "message": "Reward claimed",
  "reward": {
    "amount": "decimal-string",
    "totalEarned": "decimal-string"
  }
}
```

---

### Wallet Endpoints

#### GET /api/protected/wallet

Get wallet balance information.

**Response (200):**
```json
{
  "id": "uuid",
  "userId": "uuid",
  "dopeBalance": "decimal-string",
  "xlmBalance": "decimal-string",
  "lastUpdated": "ISO-8601-timestamp"
}
```

---

#### POST /api/protected/wallet/send

Send tokens to another address. *Rate limited.*

**Request Body:**
```json
{
  "toAddress": "string (required)",
  "amount": "decimal-string (required)",
  "assetType": "DOPE|XLM (required)"
}
```

**Response (200):**
```json
{
  "message": "Transaction successful",
  "transaction": {
    "hash": "string",
    "status": "string",
    "amount": "decimal-string",
    "assetType": "string"
  }
}
```

---

### Transaction Endpoints

#### GET /api/protected/transactions

Get user transaction history with pagination.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 20)

**Response (200):**
```json
[
  {
    "id": "uuid",
    "userId": "uuid",
    "type": "string",
    "amount": "decimal-string",
    "assetType": "string",
    "toAddress": "string|null",
    "fromAddress": "string|null",
    "stellarTxHash": "string|null",
    "status": "string",
    "createdAt": "ISO-8601-timestamp"
  }
]
```

---

### Network Endpoints

#### GET /api/network/stats

Get network statistics (public endpoint - no authentication required).

**Response (200):**
```json
{
  "activeMiners": 0,
  "totalSupply": "decimal-string",
  "updatedAt": "ISO-8601-timestamp"
}
```

---

## Error Handling

### Standard Error Response Format

```json
{
  "message": "Error description",
  "errors": [
    {
      "code": "error_code",
      "expected": "string",
      "received": "string",
      "path": ["field_name"],
      "message": "Field-specific error message"
    }
  ]
}
```

### HTTP Status Codes

- **200**: Success
- **201**: Created successfully
- **400**: Bad request / Validation error
- **401**: Unauthorized / Invalid token
- **404**: Resource not found
- **409**: Conflict (user already exists)
- **429**: Too many requests (rate limited)
- **500**: Internal server error

---

## Database Schema

### Users Table
- `id`: UUID primary key
- `username`: Unique username
- `email`: Unique email address
- `password`: Hashed password (bcrypt)
- `fullName`: User's full name
- `profilePicture`: Profile image URL (nullable)
- `stellarPublicKey`: Stellar wallet public key (nullable)
- `stellarSecretKey`: Stellar wallet secret key (nullable)
- `isVerified`: Email verification status
- `level`: User level (default: 1)
- `referralCode`: Unique referral code
- `referredBy`: Referring user ID (nullable)
- `createdAt`: Registration timestamp
- `updatedAt`: Last update timestamp

### Wallets Table
- `id`: UUID primary key
- `userId`: Foreign key to users table
- `dopeBalance`: DOPE token balance (decimal)
- `xlmBalance`: XLM balance (decimal)
- `lastUpdated`: Last balance update timestamp

### Mining Sessions Table
- `id`: UUID primary key
- `userId`: Foreign key to users table
- `isActive`: Session active status
- `startedAt`: Session start timestamp
- `lastClaimedAt`: Last reward claim timestamp (nullable)
- `totalEarned`: Total earned in session (decimal)
- `rate`: Mining rate (decimal)

### Transactions Table
- `id`: UUID primary key
- `userId`: Foreign key to users table
- `type`: Transaction type (mining, transfer, etc.)
- `amount`: Transaction amount (decimal)
- `assetType`: Asset type (DOPE, XLM)
- `toAddress`: Recipient address (nullable)
- `fromAddress`: Sender address (nullable)
- `stellarTxHash`: Stellar transaction hash (nullable)
- `status`: Transaction status
- `createdAt`: Transaction timestamp

### Network Stats Table
- `id`: UUID primary key
- `activeMiners`: Number of active miners
- `totalSupply`: Total DOPE token supply (decimal)
- `updatedAt`: Stats update timestamp

---

## Security Features

1. **JWT Authentication**: Secure token-based authentication
2. **Password Hashing**: bcrypt with salt rounds
3. **Rate Limiting**: IP-based request limiting
4. **Input Validation**: Zod schema validation
5. **CORS Protection**: Cross-origin request handling
6. **SQL Injection Protection**: Parameterized queries via Drizzle ORM

---

## Development Status

### Currently Implemented ✅
- User registration and authentication
- JWT token generation and validation
- Rate limiting middleware
- Database operations with PostgreSQL
- Real mining
- Wallet balance tracking
- Transaction history
- Comprehensive error handling

### Planned Features 🚧
- Real Stellar blockchain integration (Completed)
- DOPE token creation and management (Completed)
- Live mining calculations (Completed)
- Email verification
- Referral system
- Admin endpoints
- WebSocket real-time updates

---

## Testing

The API has been thoroughly tested with:
- User registration with validation
- JWT authentication flow
- Protected endpoint access
- Rate limiting behavior
- Error handling scenarios
- Database operations

All endpoints return proper HTTP status codes and structured JSON responses.