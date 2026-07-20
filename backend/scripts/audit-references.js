// 临时审计脚本：静态扫描 backend 源文件中的模型/服务方法调用标识符，
// 确认每个标识符在本文件中有声明（require/const/let/var/class/function/形参/解构），
// 且 require 的相对路径指向存在的文件。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIRS = ['config', 'controllers', 'database', 'middlewares', 'models', 'routes', 'services', 'utils'];
const FILES = [path.join(ROOT, 'app.js')];
for (const dir of DIRS) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  for (const f of fs.readdirSync(abs)) {
    if (f.endsWith('.js')) FILES.push(path.join(abs, f));
  }
}

const METHODS = ['findAll', 'findOne', 'findByPk', 'findOrCreate', 'create', 'bulkCreate', 'count', 'destroy', 'update', 'sync', 'sum', 'max', 'min', 'upsert', 'findAndCountAll'];
// X.method( 形式
const callRe = new RegExp('(?<![.\\w$])([A-Za-z_$][A-Za-z0-9_$]*)\\.(?:' + METHODS.join('|') + ')\\s*\\(', 'g');
const modelRe = /\bmodel\s*:\s*([A-Za-z_$][A-Za-z0-9_$]*)/g;

const BUILTINS = new Set(['sequelize', 'router', 'app', 'Model', 'DataTypes', 'Op', 'module', 'exports', 'require', 'console', 'process', 'Math', 'JSON', 'Object', 'Array', 'Promise', 'Number', 'String', 'Date', 'Map', 'Set', 'RegExp', 'Error', 'Boolean', 'parseInt', 'parseFloat', 'this', 'super']);

const problems = [];
for (const file of FILES) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(ROOT, file);

  // 收集声明的标识符（宽松近似）
  const declared = new Set();
  const reqRe = /(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
  const destrReqRe = /(?:const|let|var)\s*\{([^}]+)\}\s*=\s*require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = reqRe.exec(src))) {
    declared.add(m[1]);
    const spec = m[2];
    if (spec.startsWith('.')) {
      const target = path.resolve(path.dirname(file), spec);
      if (!fs.existsSync(target + '.js') && !fs.existsSync(target) && !fs.existsSync(path.join(target, 'index.js'))) {
        problems.push(`${rel}: require('${spec}') 指向不存在的文件`);
      }
    }
  }
  while ((m = destrReqRe.exec(src))) {
    m[1].split(',').forEach(part => {
      const name = part.trim().split(':').pop().trim();
      if (name) declared.add(name);
    });
    const spec = m[2];
    if (spec.startsWith('.')) {
      const target = path.resolve(path.dirname(file), spec);
      if (!fs.existsSync(target + '.js') && !fs.existsSync(target) && !fs.existsSync(path.join(target, 'index.js'))) {
        problems.push(`${rel}: 解构 require('${spec}') 指向不存在的文件`);
      }
    }
  }
  const declRe = /(?:const|let|var|class|function)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  while ((m = declRe.exec(src))) declared.add(m[1]);
  const destrRe = /(?:const|let|var)\s*\{([^}]+)\}\s*=/g;
  while ((m = destrRe.exec(src))) m[1].split(',').forEach(part => { const n = part.trim().split(':').pop().trim(); if (n) declared.add(n); });
  const paramRe = /(?:function[^(]*|\(|=>)\s*\(([^()]*)\)/g;
  while ((m = paramRe.exec(src))) m[1].split(',').forEach(p => { const n = p.trim().split('=')[0].trim(); if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n)) declared.add(n); });
  // 对象方法名 / 模块导出键（如 getXxx: async ...）不算，但模型别名场景通常走 require
  const forOfRe = /for\s*\(\s*(?:const|let|var)\s+(?:\[([^\]]+)\]|([A-Za-z_$][A-Za-z0-9_$]*))/g;
  while ((m = forOfRe.exec(src))) { (m[1] || m[2] || '').split(',').forEach(n => { n = n.trim(); if (n) declared.add(n); }); }

  const used = new Map();
  while ((m = callRe.exec(src))) {
    if (!used.has(m[1])) used.set(m[1], []);
    used.get(m[1]).push(src.slice(0, m.index).split('\n').length);
  }
  while ((m = modelRe.exec(src))) {
    if (!used.has(m[1])) used.set(m[1], []);
    used.get(m[1]).push(src.slice(0, m.index).split('\n').length);
  }
  for (const [ident, lines] of used) {
    if (BUILTINS.has(ident)) continue;
    if (!declared.has(ident)) {
      problems.push(`${rel}: 标识符 "${ident}" 被使用（行 ${lines.slice(0, 5).join(',')}）但未在文件中声明/require`);
    }
  }
}

if (problems.length) {
  console.log('发现问题：');
  problems.forEach(p => console.log(' - ' + p));
  process.exit(1);
} else {
  console.log(`引用完整性扫描通过（共 ${FILES.length} 个文件），未发现缺失声明或失效 require。`);
}
