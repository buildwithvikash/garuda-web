// What the services need to know about the signed-in user (req.session, set by middleware/authenticate.js).

export const sessionContext = (req) => ({ businessUnit: req.session.businessUnit, department: req.session.department, userCode: req.session.userCode, userId: req.session.userId, line: req.session.line ?? '0', lineName: req.session.lineName ?? '' });
