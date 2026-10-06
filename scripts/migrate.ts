import { getDb } from "../src/db";

// 打开数据库时会自动应用未执行的迁移；应用启动时也会做同样的事
getDb();
console.log("migrations applied");
