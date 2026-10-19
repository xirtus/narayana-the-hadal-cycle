import {chromium} from '@playwright/test';
import {homedir} from 'node:os';
const b=await chromium.launch({headless:true,executablePath:`${homedir()}/Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`});
try{const p=await b.newPage({viewport:{width:1440,height:1000}});await p.goto('https://app.usecrayon.ai/play/82e970f7-0d86-421a-bdfc-5ac113b22bc0',{waitUntil:'domcontentloaded',timeout:30000});await p.waitForTimeout(7000);console.log((await p.locator('body').innerText()).slice(0,7000));await p.screenshot({path:'artifacts/atlantis-reference.png'});}finally{await b.close();}
