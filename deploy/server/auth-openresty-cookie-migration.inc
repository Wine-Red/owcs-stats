# Remove cookies created before TinyAuth subdomain support was enabled. These
# host-only cookies otherwise shadow the shared owmini.xyz session cookie and
# cause a redirect loop between /continue and the protected application.
add_header Set-Cookie "tinyauth-session-ce0c2e9e=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Lax" always;
add_header Set-Cookie "tinyauth-csrf-ce0c2e9e=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Lax" always;
add_header Set-Cookie "tinyauth-redirect-ce0c2e9e=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Lax" always;
add_header Set-Cookie "tinyauth-oauth-ce0c2e9e=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; HttpOnly; SameSite=Lax" always;
