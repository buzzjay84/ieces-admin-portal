const fs = require('node:fs');

// Only seed a new workspace; existing portal records must be restored through backup/import.
function inheritStandaloneRecords(source, destination) {
  if (fs.existsSync(destination) || !fs.existsSync(source)) return false;
  const data = JSON.parse(fs.readFileSync(source, 'utf8'));
  if (!data || !Array.isArray(data.units) || !Array.isArray(data.adults)
    || data.units.some(unit => !unit || !Array.isArray(unit.scouts))) {
    throw new Error('The standalone BSP data is invalid. Restore a valid backup before opening the workspace.');
  }
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
  return true;
}

module.exports = { inheritStandaloneRecords };
