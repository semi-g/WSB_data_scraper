import puppeteer from "puppeteer";



const main = async () => {
    // Launch a headless browser instance
    const browser = await puppeteer.launch();

    // Open a new page
    const page = await browser.newPage();

    // Navigate to the desired URL
    const url = 'https://www.coindesk.com/newsletters/the-node/';
    await page.goto(url);

    // Wait for any asynchronous content to load
    // await page.waitForTimeout(1000); // Adjust the timeout as needed

    // Wait until page loads and get relevant data
    const allArticles = await page.evaluate(() => {
        const articles = document.querySelectorAll('.article-cardstyles__AcTitle-sc-q1x8lc-1');
        
        return Array.from(articles).slice(0,3).map((article) => {
            const title = article.querySelector('div.card-title')
            const url = article.querySelector('a').href
            return { title, url }
        })
   
    });
    
    console.log(allArticles)

    // Close the browser instance
    await browser.close();
};

main()