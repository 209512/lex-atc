module.exports = function setupApiRoutes(app, svc, middlewares) {
    require('./api/auth')(app, svc, middlewares);
    require('./api/system')(app, svc, middlewares);
    require('./api/agents')(app, svc, middlewares);
    require('./api/tasks')(app, svc, middlewares);
    require('./api/settlement')(app, svc, middlewares);
    require('./api/governance')(app, svc, middlewares);
};
