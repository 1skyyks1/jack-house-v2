function resolveUserPermissions(user) {
    const assigned = Array.isArray(user?.roles) ? user.roles : [];
    const roles = assigned.map(role => role.role_code);
    const permissionSet = new Set();
    for (const role of assigned) {
        if (Array.isArray(role.permissions)) {
            role.permissions.filter(p => typeof p === 'string').forEach(p => permissionSet.add(p));
        }
    }
    return { roles, permissionSet, permissions: [...permissionSet], isSuperAdmin: permissionSet.has('*') };
}

function hasPermission(permissionSet, permission) {
    if (!(permissionSet instanceof Set)) return false;
    if (permissionSet.has('*') || permissionSet.has(permission)) return true;
    if (!permission.includes(':')) return false;
    const moduleName = permission.split(':')[0];
    return permissionSet.has(moduleName) || permissionSet.has(`${moduleName}:*`);
}

function can(req, permission) {
    return Boolean(req.user) && hasPermission(req.userPermissions, permission);
}

module.exports = { resolveUserPermissions, hasPermission, can };
