const STAFF_ROLES = Object.freeze([
    'host',
    'pooler',
    'custom_mapper',
    'tester',
    'referee',
    'streamer',
    'commentator'
]);

const STAFF_ROLE_SET = new Set(STAFF_ROLES);
const PLAYER_COMPATIBLE_STAFF_ROLES = Object.freeze(['tester', 'streamer', 'commentator']);

module.exports = {
    PLAYER_COMPATIBLE_STAFF_ROLES,
    STAFF_ROLES,
    STAFF_ROLE_SET
};
