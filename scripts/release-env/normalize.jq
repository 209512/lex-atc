def truthy:
  if . == true then true
  elif . == false then false
  else ((tostring | ascii_downcase) == "true" or (tostring | ascii_downcase) == "1" or (tostring | ascii_downcase) == "yes")
  end;

def present:
  if . == null then false
  elif (type == "string") then (length > 0)
  else true
  end;

{
  NODE_ENV: (.NODE_ENV // .node_env // .environment // null),
  CORS_ALLOWED_ORIGINS: (.CORS_ALLOWED_ORIGINS // .cors_allowed_origins // .corsAllowedOrigins // null),
  CONTRACT_MODE: (.CONTRACT_MODE // .contract_mode // "warn"),
  CSRF_ENFORCE_ALL_UNSAFE: (.CSRF_ENFORCE_ALL_UNSAFE // .csrf_enforce_all_unsafe // null),
  ADMIN_TOKEN_SECRET_PRESENT: (
    if (.ADMIN_TOKEN_SECRET_PRESENT? != null) then (.ADMIN_TOKEN_SECRET_PRESENT | truthy) else false end
  | if . then "true" else "false" end)
}
