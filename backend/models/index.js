const Post = require('./post/post');
const PostTranslation = require('./post/postTranslation');
const PostFile = require('./post/postFile');
const PostComment = require('./post/postComment');
const User = require('./user/user');
const Pack = require('./pack/pack');
const PackMap = require('./pack/packMap');
const Tag = require('./pack/tag');
const PackComment = require('./pack/packComment');
const PackFeedback = require('./pack/packFeedback');
const PackScore = require('./pack/packScore');
const Badge = require('./user/badge');
const Role = require('./user/role');
const RichTextAsset = require('./richTextAsset');
const RichTextAssetReference = require('./richTextAssetReference');

const Event = require('../models/event/event');
const EventStage = require('../models/event/eventStage');
const EventScore = require('../models/event/eventScore');

Post.hasMany(PostTranslation, { foreignKey: 'post_id', onDelete: 'CASCADE', as: 'translations' });
Post.hasMany(PostFile, { foreignKey: 'post_id', onDelete: 'CASCADE', as: 'files' });
Post.hasMany(PostComment, { foreignKey: 'post_id', onDelete: 'CASCADE' });
Post.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

PostComment.belongsTo(Post, { foreignKey: 'post_id' });
PostComment.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

PostFile.belongsTo(Post, { foreignKey: 'post_id' });
PostFile.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

PostTranslation.belongsTo(Post, { foreignKey: 'post_id', as: 'post' });

RichTextAsset.hasMany(RichTextAssetReference, { foreignKey: 'rich_text_asset_id', onDelete: 'CASCADE', as: 'references' });
RichTextAssetReference.belongsTo(RichTextAsset, { foreignKey: 'rich_text_asset_id', as: 'asset' });

User.hasMany(Post, { foreignKey: 'user_id', onDelete: 'CASCADE' })
User.hasMany(PostFile, { foreignKey: 'user_id', onDelete: 'CASCADE' });
User.hasMany(PostComment, { foreignKey: 'user_id', onDelete: 'CASCADE' })
User.hasMany(Pack, { foreignKey: 'user_id', onDelete: 'CASCADE' });
User.hasMany(EventScore, { foreignKey: 'user_id', onDelete: 'CASCADE' });
User.hasMany(PackScore, { foreignKey: 'user_id', onDelete: 'CASCADE' });
User.belongsToMany(Badge, {
    through: 'user_badges',
    foreignKey: 'user_id',
    otherKey: 'badge_id',
    as: 'badges'
})
User.belongsToMany(Role, {
    through: 'user_roles',
    foreignKey: 'user_id',
    otherKey: 'role_id',
    as: 'roles'
})

Pack.belongsToMany(Tag, {
    through: 'pack_tags',
    foreignKey: 'pack_id',
    otherKey: 'tag_id',
    as: 'tags'
})
Pack.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Pack.hasMany(PackComment, { foreignKey: 'pack_id' });
Pack.hasMany(PackMap, { foreignKey: 'pack_id', as: 'maps' });
Pack.hasMany(PackFeedback, { foreignKey: 'pack_id', onDelete: 'CASCADE', as: 'feedback' });
Pack.hasMany(PackScore, { foreignKey: 'pack_id', onDelete: 'CASCADE', as: 'scores' });

PackMap.belongsTo(Pack, { foreignKey: 'pack_id' });

PackScore.belongsTo(Pack, { foreignKey: 'pack_id', as: 'pack' });
PackScore.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

Tag.belongsToMany(Pack, {
    through: 'pack_tags',
    foreignKey: 'tag_id',
    otherKey: 'pack_id',
    as: 'packs'
})

PackComment.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
PackComment.belongsTo(Pack, { foreignKey: 'pack_id' });

PackFeedback.belongsTo(Pack, { foreignKey: 'pack_id', as: 'pack' });
PackFeedback.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
User.hasMany(PackFeedback, { foreignKey: 'user_id', onDelete: 'CASCADE', as: 'packFeedback' });

Badge.belongsToMany(User, {
    through: 'user_badges',
    foreignKey: 'badge_id',
    otherKey: 'user_id',
    as: 'users'
})

Role.belongsToMany(User, {
    through: 'user_roles',
    foreignKey: 'role_id',
    otherKey: 'user_id',
    as: 'users'
})

Event.hasMany(EventStage, { foreignKey: 'event_id', onDelete: 'CASCADE', as: 'stage' });

EventStage.belongsTo(Event, { foreignKey: 'event_id', as: 'event' });
EventStage.hasMany(EventScore, { foreignKey: 'stage_id', onDelete: 'SET NULL', as: 'score' });

EventScore.belongsTo(EventStage, { foreignKey: 'stage_id', onDelete: 'SET NULL', as: 'stage' });
EventScore.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

module.exports = {
    Post,
    PostTranslation,
    PostFile,
    PostComment,
    User,
    Badge,
    Pack,
    PackMap,
    Tag,
    PackComment,
    PackFeedback,
    PackScore,
    Event,
    EventStage,
    EventScore,
    RichTextAsset,
    RichTextAssetReference
};
