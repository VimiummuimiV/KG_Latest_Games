const fs = require('fs');
const path = require('path');

// Path to the header file
const headersPath = path.resolve(__dirname, 'src/header.js');

try {
  let headerContent = fs.readFileSync(headersPath, 'utf8');
  
  // Extract current version
  const versionMatch = headerContent.match(/\/\/ @version\s+(\d+)\.(\d+)\.(\d+)/);
  if (versionMatch) {
    let major = parseInt(versionMatch[1], 10);
    let minor = parseInt(versionMatch[2], 10);
    let patch = parseInt(versionMatch[3], 10);
    
    // Increment the patch version
    patch++;
    
    // If patch reaches 10, increment minor and reset patch
    if (patch >= 10) {
      minor++;
      patch = 0;
      
      // If minor reaches 10, increment major and reset minor
      if (minor >= 10) {
        major++;
        minor = 0;
      }
    }
    
    const newVersion = `${major}.${minor}.${patch}`;
    
    // Replace the version in the header
    headerContent = headerContent.replace(
      /\/\/ @version\s+\d+\.\d+\.\d+/, 
      `// @version      ${newVersion}`
    );
    
    // Write back to the headers file
    fs.writeFileSync(headersPath, headerContent);
    console.log(`Updated version to ${newVersion}`);
  } else {
    console.warn('Version pattern not found in header.js');
  }
} catch (error) {
  console.error('Error updating version:', error);
  process.exit(1);
}