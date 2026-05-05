/**
 * Script to verify actual symbol formats on exchanges
 * This will check what symbols are actually available on each exchange
 */

import axios from 'axios';

const tokensToCheck = ['KASMO', 'BITE', 'GECKO', 'KROAK', 'MATRIX', 'ZEAL', 'SLOW', 'KASPY', 'TBDAI'];

async function checkGateIo() {
  console.log('\n🔍 Checking Gate.io...');
  try {
    const response = await axios.get('https://api.gateio.ws/api/v4/spot/currency_pairs');
    const pairs = response.data;
    
    for (const token of tokensToCheck) {
      const formats = [
        `${token}_USDT`,
        `${token}/USDT`,
        `${token}USDT`,
      ];
      
      for (const format of formats) {
        const found = pairs.find((p: any) => p.id === format);
        if (found) {
          console.log(`  ✅ ${token}: Found as "${format}" (status: ${found.trade_status})`);
          break;
        }
      }
    }
  } catch (error) {
    console.error('  ❌ Error:', error.message);
  }
}

async function checkAscendEx() {
  console.log('\n🔍 Checking AscendEX...');
  try {
    const response = await axios.get('https://ascendex.com/api/pro/v1/products');
    const pairs = response.data.data;
    
    for (const token of tokensToCheck) {
      const formats = [
        `${token}/USDT`,
        `${token}_USDT`,
        `${token}USDT`,
      ];
      
      for (const format of formats) {
        const found = pairs.find((p: any) => p.symbol === format);
        if (found) {
          console.log(`  ✅ ${token}: Found as "${format}"`);
          break;
        }
      }
    }
  } catch (error) {
    console.error('  ❌ Error:', error.message);
  }
}

async function checkCoinEx() {
  console.log('\n🔍 Checking CoinEx...');
  try {
    const response = await axios.get('https://api.coinex.com/v2/market/list');
    const pairs = response.data.data;
    
    for (const token of tokensToCheck) {
      const formats = [
        `${token}USDT`,
        `${token}_USDT`,
        `${token}/USDT`,
      ];
      
      for (const format of formats) {
        const found = pairs.find((p: string) => p === format);
        if (found) {
          console.log(`  ✅ ${token}: Found as "${format}"`);
          break;
        }
      }
    }
  } catch (error) {
    console.error('  ❌ Error:', error.message);
  }
}

async function checkMexc() {
  console.log('\n🔍 Checking MEXC...');
  try {
    const response = await axios.get('https://api.mexc.com/api/v3/exchangeInfo');
    const pairs = response.data.symbols;
    
    for (const token of tokensToCheck) {
      const formats = [
        `${token}USDT`,
        `${token}_USDT`,
        `${token}/USDT`,
      ];
      
      for (const format of formats) {
        const found = pairs.find((p: any) => p.symbol === format && p.status === 'ENABLED');
        if (found) {
          console.log(`  ✅ ${token}: Found as "${format}"`);
          break;
        }
      }
    }
  } catch (error) {
    console.error('  ❌ Error:', error.message);
  }
}

async function main() {
  console.log('🔍 Verifying symbol formats on exchanges...\n');
  await checkGateIo();
  await checkAscendEx();
  await checkCoinEx();
  await checkMexc();
  console.log('\n✅ Verification complete');
}

main();


