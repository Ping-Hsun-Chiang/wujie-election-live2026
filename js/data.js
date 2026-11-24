/*
 * 選區與正式選舉資料（內建）
 * 115 年宜蘭縣第 7 選舉區（五結鄉）縣議員選舉
 */
(function () {
  'use strict';

  var candidates = [
    { no: 1, name: '張明華', party: '民主進步黨', color: '#16A34A' },
    { no: 2, name: '沈信雄', party: '無黨籍', color: '#F59E0B' },
    { no: 3, name: '林義剛', party: '中國國民黨', color: '#2563EB', focus: true },
    { no: 4, name: '黃子堯', party: '無黨籍', color: '#A855F7' }
  ];

  // 五結鄉 15 村（供後台標註）
  var villages = [
    '三興村', '二結村', '鎮安村', '上四村', '中興村',
    '四結村', '福興村', '五結村', '大吉村', '協和村',
    '孝威村', '錦眾村', '利澤村', '成興村', '季新村'
  ];

  // 已確認的投開票所村別；其餘請選前於後台批次匯入，不預先猜測
  var knownStations = {
    '0357': { village: '三興村', location: '' },
    '0395': { village: '季新村', location: '' }
  };

  var FIRST = 357;
  var LAST = 395;
  var stationCodes = [];
  for (var n = FIRST; n <= LAST; n++) {
    stationCodes.push(('0000' + n).slice(-4));
  }

  window.ELECTION = {
    title: '2026 宜蘭縣第 7 選舉區（五結鄉）縣議員即時開票中心',
    eventName: '115 年地方公職人員選舉',
    districtName: '宜蘭縣第 7 選舉區（五結鄉）縣議員',
    township: '五結鄉',
    seats: 3,
    focusNo: 3,
    candidates: candidates,
    villages: villages,
    knownStations: knownStations,
    stationCodes: stationCodes,
    highVoteThreshold: 1500
  };
})();
