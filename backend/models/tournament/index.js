// 赛事系统模型索引
const Tournament = require('./tournament');
const TStaff = require('./tStaff');
const TTeam = require('./tTeam');
const TPlayer = require('./tPlayer');
const TRound = require('./tRound');
const TMappool = require('./tMappool');
const TMatch = require('./tMatch');
const TMatchAction = require('./tMatchAction');
const TGame = require('./tGame');
const TQualMappool = require('./tQualMappool');
const TQualScore = require('./tQualScore');
const TQualImport = require('./tQualImport');
const TSection = require('./tSection');
const TAuditLog = require('./tAuditLog');
const User = require('../user/user');

// 定义模型关联

// Tournament 关联
Tournament.hasMany(TStaff, { foreignKey: 't_id', as: 'staff' });
Tournament.hasMany(TTeam, { foreignKey: 't_id', as: 'teams' });
Tournament.hasMany(TPlayer, { foreignKey: 't_id', as: 'players' });
Tournament.hasMany(TRound, { foreignKey: 't_id', as: 'rounds' });
Tournament.hasMany(TQualMappool, { foreignKey: 't_id', as: 'qualMaps' });
Tournament.hasMany(TQualImport, { foreignKey: 't_id', as: 'qualImports' });
Tournament.hasMany(TSection, { foreignKey: 't_id', as: 'sections' });
Tournament.hasMany(TAuditLog, { foreignKey: 't_id', as: 'auditLogs' });
Tournament.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

// TStaff 关联
TStaff.belongsTo(Tournament, { foreignKey: 't_id', as: 'tournament' });
TStaff.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// TTeam 关联
TTeam.belongsTo(Tournament, { foreignKey: 't_id', as: 'tournament' });
TTeam.belongsTo(User, { foreignKey: 'captain_id', as: 'captain' });
TTeam.belongsTo(TPlayer, { foreignKey: 'captain_player_id', as: 'captainPlayer' });
TTeam.hasMany(TPlayer, { foreignKey: 'team_id', as: 'players' });
TTeam.hasMany(TQualScore, { foreignKey: 'team_id', as: 'qualScores' });

// TPlayer 关联
TPlayer.belongsTo(Tournament, { foreignKey: 't_id', as: 'tournament' });
TPlayer.belongsTo(TTeam, { foreignKey: 'team_id', as: 'team' });
TPlayer.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// TRound 关联
TRound.belongsTo(Tournament, { foreignKey: 't_id', as: 'tournament' });
TRound.hasMany(TMappool, { foreignKey: 'round_id', as: 'mappool' });
TRound.hasMany(TMatch, { foreignKey: 'round_id', as: 'matches' });

// TMappool 关联
TMappool.belongsTo(TRound, { foreignKey: 'round_id', as: 'round' });

// TMatch 关联
TMatch.belongsTo(TRound, { foreignKey: 'round_id', as: 'round' });
TMatch.belongsTo(TTeam, { foreignKey: 'team1_id', as: 'team1' });
TMatch.belongsTo(TTeam, { foreignKey: 'team2_id', as: 'team2' });
TMatch.belongsTo(TTeam, { foreignKey: 'winner_id', as: 'winner' });
TMatch.hasMany(TGame, { foreignKey: 'match_id', as: 'games' });
TMatch.hasMany(TMatchAction, { foreignKey: 'match_id', as: 'actions' });

// TMatchAction 关联
TMatchAction.belongsTo(TMatch, { foreignKey: 'match_id', as: 'match' });
TMatchAction.belongsTo(TTeam, { foreignKey: 'team_id', as: 'team' });
TMatchAction.belongsTo(TMappool, { foreignKey: 'map_id', as: 'map' });
TMatchAction.belongsTo(User, { foreignKey: 'created_by', as: 'createdBy' });

// TGame 关联
TGame.belongsTo(TMatch, { foreignKey: 'match_id', as: 'match' });
TGame.belongsTo(TMappool, { foreignKey: 'map_id', as: 'map' });

// TQualMappool 关联
TQualMappool.belongsTo(Tournament, { foreignKey: 't_id', as: 'tournament' });
TQualMappool.hasMany(TQualScore, { foreignKey: 'map_id', as: 'scores' });

// TQualImport 关联
TQualImport.belongsTo(Tournament, { foreignKey: 't_id', as: 'tournament' });
TQualImport.belongsTo(TTeam, { foreignKey: 'team_id', as: 'team' });
TQualImport.belongsTo(User, { foreignKey: 'imported_by', as: 'importedBy' });
TQualImport.hasMany(TQualScore, { foreignKey: 'import_id', as: 'scores' });

// TQualScore 关联
TQualScore.belongsTo(TQualMappool, { foreignKey: 'map_id', as: 'map' });
TQualScore.belongsTo(TTeam, { foreignKey: 'team_id', as: 'team' });
TQualScore.belongsTo(TPlayer, { foreignKey: 'player_id', as: 'player' });
TQualScore.belongsTo(TQualImport, { foreignKey: 'import_id', as: 'importLog' });

// TSection 关联
TSection.belongsTo(Tournament, { foreignKey: 't_id', as: 'tournament' });
TSection.belongsTo(User, { foreignKey: 'updated_by', as: 'updatedBy' });

// TAuditLog 关联
TAuditLog.belongsTo(Tournament, { foreignKey: 't_id', as: 'tournament' });
TAuditLog.belongsTo(User, { foreignKey: 'operator_id', as: 'operator' });

module.exports = {
    Tournament,
    TStaff,
    TTeam,
    TPlayer,
    TRound,
    TMappool,
    TMatch,
    TMatchAction,
    TGame,
    TQualMappool,
    TQualScore,
    TQualImport,
    TSection,
    TAuditLog
};
