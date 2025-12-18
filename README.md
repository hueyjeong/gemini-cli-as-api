# 🚀 Gemini CLI Native API

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/gewoonjaap)

Google's Gemini models Native API using Cloudflare Workers. Access Google's most advanced AI models through Gemini-native API patterns, powered by OAuth2 authentication and the same infrastructure that drives the official Gemini CLI.

이 프로젝트는 https://github.com/GewoonJaap/gemini-cli-openai 를 기반으로 만들어졌습니다.

## ✅ Tested On

This API has been successfully tested with:
- **Direct Connection**:
  - 🤖 Roo Code
- **Through LiteLLM**:
  - 👨‍💻 GitHub Copilot
  - 🔮 Cursor

## ✨ Features

- 🔐 **OAuth2 Authentication** - No API keys required, uses your Google account
- 🎯 **Gemini-Native API** - Native endpoints for Google Gemini models
- 🖼️ **Vision Support** - Multi-modal conversations with images (base64 & URLs)
- 🔧 **Tool Calling Support** - Function calling with Gemini API integration
- 🧠 **Advanced Reasoning** - Support for Gemini's thinking capabilities with effort controls
- 🛡️ **Content Safety** - Configurable Gemini moderation settings
- ⚡ **Cloudflare Workers** - Global edge deployment with low latency
- 🔄 **Smart Token Caching** - Intelligent token management with KV storage
- 🆓 **Free Tier Access** - Leverage Google's free tier through Code Assist API
- 📡 **Real-time Streaming** - Server-sent events for live responses
- 🎭 **Multiple Models** - Access to latest Gemini models including experimental ones

## 🤖 Supported Models

| Model ID | Context Window | Max Tokens | Thinking Support | Description |
|----------|----------------|------------|------------------|-------------|
| `gemini-3-pro-preview` | 1M | 65K | ✅ | Google's Gemini 3.0 Pro Preview model |
| `gemini-3-flash-preview` | 1M | 65K | ✅ | Google's Gemini 3.0 Flash Preview model |
| `gemini-2.5-pro` | 1M | 65K | ✅ | Latest Gemini 2.5 Pro model with reasoning capabilities |
| `gemini-2.5-flash` | 1M | 65K | ✅ | Fast Gemini 2.5 Flash model with reasoning capabilities |
| `gemini-2.5-flash-lite` | 1M | 65K | ✅ | Lightweight version of Gemini 2.5 Flash model with reasoning capabilities |

## 🛠️ Setup

### Prerequisites

1. **Google Account** with access to Gemini
2. **Cloudflare Account** with Workers enabled
3. **Wrangler CLI** installed (`npm install -g wrangler`)

### Step 1: Get OAuth2 Credentials

You need OAuth2 credentials from a Google account that has accessed Gemini. The easiest way to get these is through the official Gemini CLI.

#### Using Gemini CLI

1. **Install Gemini CLI**:
   ```bash
   npm install -g @google/gemini-cli
   ```

2. **Start the Gemini CLI**:
   ```bash
   gemini
   ```
3. **Authenticate with Google**:
   
   Select `● Login with Google`.
   
   A browser window will now open prompting you to login with your Google account.
   
4. **Locate the credentials file**:
   
   **Windows:**
   ```
   C:\Users\USERNAME\.gemini\oauth_creds.json
   ```
   
   **macOS/Linux:**
   ```
   ~/.gemini/oauth_creds.json
   ```

5. **Copy the credentials**:
   The file contains JSON in this format:
   ```json
   {
     "access_token": "ya29.a0AS3H6Nx...",
     "refresh_token": "1//09FtpJYpxOd...",
     "scope": "https://www.googleapis.com/auth/cloud-platform ...",
     "token_type": "Bearer",
     "id_token": "eyJhbGciOiJSUzI1NiIs...",
     "expiry_date": 1750927763467
   }
   ```

### Step 2: Create KV Namespace

```bash
# Create a KV namespace for token caching
wrangler kv namespace create "GEMINI_CLI_KV"
```

Note the namespace ID returned.
Update `wrangler.toml` with your KV namespace ID:
```toml
kv_namespaces = [
  { binding = "GEMINI_CLI_KV", id = "your-kv-namespace-id" }
]
```

### Step 3: Environment Setup

Create a `.dev.vars` file:
```bash
# Required: OAuth2 credentials JSON from Gemini CLI authentication
GCP_SERVICE_ACCOUNT={"access_token":"ya29...","refresh_token":"1//...","scope":"...","token_type":"Bearer","id_token":"eyJ...","expiry_date":1750927763467}

# Optional: API key for authentication (if not set, API is public)
# When set, clients must include "x-goog-api-key: <your-api-key>" header
GEMINI_API_KEY=your-secret-api-key-here

# Optional: Enable automatic model fallback on rate limits (429/503)
ENABLE_AUTO_MODEL_SWITCHING=true
```

### Step 4: Deploy

```bash
# Install dependencies
npm install

# Deploy to Cloudflare Workers
npm run deploy

# Or run locally for development
npm run dev
```

## 📡 API Endpoints

### Base URL
```
https://your-worker.your-subdomain.workers.dev
```

### List Models
```http
GET /gemini/models
```

### Generate Content
```http
POST /gemini/models/{model}:generateContent
```

### Stream Generate Content
```http
POST /gemini/models/{model}:streamGenerateContent
```

## 🏗️ How It Works

```mermaid
graph TD
    A[Client Request] --> B[Cloudflare Worker]
    B --> C{Token in KV Cache?}
    C -->|Yes| D[Use Cached Token]
    C -->|No| E[Check Environment Token]
    E --> F{Token Valid?}
    F -->|Yes| G[Cache & Use Token]
    F -->|No| H[Refresh Token]
    H --> I[Cache New Token]
    D --> J[Call Gemini API]
    G --> J
    I --> J
    J --> K[Stream Response]
    K --> L[Gemini Native Format]
    L --> M[Client Response]
```

## 🔄 Automatic Model Fallback

The API supports automatic fallback to faster/lighter models when the primary model hits rate limits (429) or service unavailability (503).

### How it works:
1. If a request to a Pro model fails with a 429 or 503 error.
2. The system checks if `ENABLE_AUTO_MODEL_SWITCHING=true` is set.
3. It automatically retries the request using a pre-configured Flash model.
4. A notification message is prepended to the response to inform the user about the switch.

### Default Mappings:
- `gemini-3-pro-preview` → `gemini-3-flash-preview`
- `gemini-2.5-pro` → `gemini-2.5-flash`

## 📄 License

This codebase is provided for personal use and self-hosting only.
