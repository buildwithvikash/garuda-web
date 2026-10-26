// SQL used by login, kept as in AVLogin / LoginForm but parameterized.
import { query, scalar, execute } from '../../db/connection.js';

export const authRepo = {
  userByUserId: (userId) => query('select * from Users where UserID=@userId', { userId }),
  userByUserCode: (userCode) => query('select * from Users where UserCode=@userCode', { userCode }),
  userBusinessUnits: (userCode) => query('Select * from UserBusinessUnits  where UserCode=@userCode', { userCode }),
  businessUnitsForUserId: (userId) =>
    query('Select * from UserBusinessUnits  where UserCode=(select UserCode from Users where UserID=@userId)', { userId }),
  department: (empCode) => scalar('select Department from employee where EmpCode=@empCode', { empCode }),
  wrongPassword: (userId) => execute('Update Users set WrongPw=WrongPw+1  where userID=@userId', { userId }),
  lockIfTooMany: (userId) => execute('Update Users set Locked=1  where userID=@userId and WrongPw>=3', { userId }),
  // LastActivityOn is sent as the same 'dd-MMM-yyyy hh:mm:ss' text the original concatenated into the SQL.
  loginOk: (userId, lastActivityOn) =>
    execute('Update Users set WrongPw=0, LastActivityOn=@lastActivityOn where userID=@userId', { userId, lastActivityOn }),
  setPassword: (userId, password) =>
    execute(
      'Update Users set WrongPw=0,Password=@password, LastActivityOn=getdate(), LastPwChOn=getdate() where userID=@userId',
      { userId, password },
    ),

  businessUnits: () => query('select BUCode,Name from BusinessUnit where Status=1'),
  productionLines: () => query('Select LineCode,Name FROM ProductionLine where Status=1'),
  company: () => query('Select * from Company'),

  userForMenu: (userCode) => query('Select DefaultForm,SystemUser,Photo,UserName from users where usercode=@userCode', { userCode }),
  roleForms: (userCode) =>
    query('Select * from UserRoleForm where rolecode=(select UserRole from Users where UserCode =@userCode)', { userCode }),
};
