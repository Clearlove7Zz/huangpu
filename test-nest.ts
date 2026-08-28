const jun = { forecastBalance: 420 };
const cash = { criticalBalance: 200 };
const x =
  `结余 **${jun?.forecastBalance} 万**${(jun?.forecastBalance ?? 0) < cash.criticalBalance ? `，**低于临界值 ${cash.criticalBalance} 万，触发垫资预警**` : ''}；5 月实际结余。\n\n` +
  `敏感性分析：\n` +
  `结论：并预留 ${cash.criticalBalance} 万以上安全垫。`;
console.log(x);
