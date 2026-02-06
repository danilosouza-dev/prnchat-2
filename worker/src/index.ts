/**
 * PrinChat API Worker
 * Handles secure file uploads to Bunny.net and interacts with Supabase
 */

export interface Env {
    BUNNY_STORAGE_KEY: string;
    BUNNY_STORAGE_NAME: string;
    BUNNY_STORAGE_REGION: string; // 'br', 'ny', or 'de' for hostname selection
    SUPABASE_URL: string;
    SUPABASE_ANON_KEY: string;
}

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        // Define CORS headers consistently
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*", // Or specific extension ID if needed
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Filename",
            "Access-Control-Max-Age": "86400",
        };

        // Handle CORS preflight requests
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: corsHeaders,
            });
        }

        const url = new URL(request.url);
        const path = url.pathname;

        try {
            // Route: /upload (POST)
            if (path === "/upload" && request.method === "POST") {
                const response = await handleUpload(request, env);
                Object.entries(corsHeaders).forEach(([key, value]) => {
                    response.headers.set(key, value);
                });
                return response;
            }

            // Route: /fetch-media (GET) - Proxy to bypass CORS/Hotlink protection
            if (path === "/fetch-media" && request.method === "GET") {
                const mediaUrl = url.searchParams.get("url");
                if (!mediaUrl) {
                    return new Response("Missing 'url' parameter", { status: 400, headers: corsHeaders });
                }

                // Security: Ensure we are only proxying our own CDN domain to prevent open proxy abuse
                if (!mediaUrl.includes(".b-cdn.net")) {
                    return new Response("Forbidden domain", { status: 403, headers: corsHeaders });
                }

                const response = await handleFetchMedia(mediaUrl, env);
                Object.entries(corsHeaders).forEach(([key, value]) => {
                    response.headers.set(key, value);
                });
                return response;
            }

            return new Response("Not Found", {
                status: 404,
                headers: corsHeaders
            });

        } catch (error: any) {
            return new Response(`Internal Server Error: ${error.message}`, {
                status: 500,
                headers: corsHeaders
            });
        }
    },
};

async function handleUpload(request: Request, env: Env): Promise<Response> {
    // 1. Validate Authentication (Supabase JWT)
    const authHeader = request.headers.get("Authorization");
    if (!authHeader) {
        return new Response("Unauthorized: Missing Authorization header", { status: 401 });
    }

    // Verify JWT with Supabase (simplified check for now, ideally verify signature)
    const user = await verifySupabaseUser(authHeader, env);
    if (!user) {
        return new Response("Unauthorized: Invalid Token", { status: 401 });
    }

    // 2. Get File Data
    const filename = request.headers.get("X-Filename") || `upload-${Date.now()}.bin`;
    const fileData = await request.arrayBuffer();

    if (!fileData || fileData.byteLength === 0) {
        return new Response("Bad Request: No file data", { status: 400 });
    }

    // 3. Construct Bunny.net URL based on region
    const hostname = getStorageHostname(env.BUNNY_STORAGE_REGION);

    const storageUrl = `https://${hostname}/${env.BUNNY_STORAGE_NAME}/${user.id}/${filename}`;

    // 4. Upload to Bunny.net
    const uploadResponse = await fetch(storageUrl, {
        method: "PUT",
        headers: {
            "AccessKey": env.BUNNY_STORAGE_KEY,
            "Content-Type": "application/octet-stream",
        },
        body: fileData,
    });

    if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        return new Response(`Upload Failed: ${errorText}`, { status: 502 });
    }

    // 5. Respond with Success and Public URL
    const publicPath = `/${user.id}/${filename}`;
    // Use configured Hostname for CDN if available, or fallback to direct bunny storage
    const directUrl = `https://${env.BUNNY_STORAGE_NAME}.b-cdn.net${publicPath}`;

    return new Response(JSON.stringify({
        success: true,
        path: publicPath,
        url: directUrl
    }), {
        headers: { "Content-Type": "application/json" }
    });
}

async function verifySupabaseUser(authHeader: string, env: Env): Promise<{ id: string } | null> {
    const token = authHeader.replace("Bearer ", "");

    // Call Supabase getUser to verify
    const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
            "Authorization": `Bearer ${token}`,
            "apikey": env.SUPABASE_ANON_KEY
        }
    });

    if (!response.ok) {
        return null;
    }

    return await response.json();
}

// Helper to get storage hostname
function getStorageHostname(region: string): string {
    if (region === "br") return "br.storage.bunnycdn.com";
    if (region === "ny") return "ny.storage.bunnycdn.com";
    return "storage.bunnycdn.com";
}

async function handleFetchMedia(url: string, env: Env): Promise<Response> {
    try {
        // Commercial Solution: Fetch directly from Storage API using credentials
        // This bypasses CDN hotlink protection by using authenticated access

        const urlObj = new URL(url);

        // Extract the path (e.g., /user-id/filename.mp3)
        // Public URL: https://princhat-files.b-cdn.net/userId/file.mp3
        const filePath = urlObj.pathname;

        // Construct Storage API URL
        // Format: https://{storageHostname}/{storageName}/{path}
        const hostname = getStorageHostname(env.BUNNY_STORAGE_REGION);
        const storageUrl = `https://${hostname}/${env.BUNNY_STORAGE_NAME}${filePath}`;

        console.log(`[Proxy] Fetching from Storage API: ${storageUrl}`);

        const response = await fetch(storageUrl, {
            method: "GET",
            headers: {
                "AccessKey": env.BUNNY_STORAGE_KEY.trim()
            }
        });

        if (!response.ok) {
            console.error(`[Proxy] Storage API failed: ${response.status}. Path: ${filePath}`);
            return new Response(`Failed to fetch media from storage: ${response.status}`, { status: response.status });
        }

        const contentType = response.headers.get("Content-Type") || "application/octet-stream";
        const body = response.body;

        return new Response(body, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=3600",
                "Access-Control-Allow-Origin": "*"
            }
        });
    } catch (e: any) {
        return new Response(`Fetch Error: ${e.message}`, { status: 500 });
    }
}
