/** Setup of alpaca client API to submit trades */

/** Quick simple test strategy outline:
 *  > Get WSB moves for tomorrow's top 5 stocks (buy and sell)
 *  > Check if asset already owned
 *  > If stock is a buy:
 *    - If stock already owned -> buy for extra 10% of portfolio
 *    - If not yet owned -> buy for 10% of portfolio
 *    - Max stock allocation:
 *        - 30% of portfolio into 1 stock
 *        - Max 15 stocks
 *  > If stock is a sell:
 *    - If stock owned -> sell 
 *    - If not owned -> do nothing
 *    - No minimum holding
 */

import Alpaca from "@alpacahq/alpaca-trade-api"
import dotenv from "dotenv"
import fs from 'fs'
import {promptGPT} from './llm_interface.js'

dotenv.config()

const alpaca = new Alpaca ({
    keyId: process.env.ALPACA_KEY,
    secretKey: process.env.ALPACA_SECRET,
    paper: true
})

// Main function for portfolio rebalancing -> daily
async function rebalancePortfolio() {
    // Get trade recommendations
    const tickerData = await getTickerData() 
    // Get current holdings
    const positions = await alpaca.getPositions()

    for (const ticker of tickerData) {
        const tickerSymbol = Object.keys(ticker)[0]
        const tickerValue = Object.values(ticker)[0]
        let marketValue

        // Check if asset currently owned
        for (const position of positions) {
            if (tickerSymbol === position.symbol) {
                marketValue = position.market_value
                break
            }
        }

        // Scenario 1: Asset owned (or not owned) and has positive sentiment -> buy 10% until max 30% of full portfolio (taking into acc 10% reserve cash)
        // Use Math.floor for risk management purposes
        if (tickerValue === 'Positive') {
            // Buy assets and if necessary liquidate worst performing to facilitate new purchases
            await managePurchases(positions, tickerSymbol, marketValue)
        }
        // Scenario 2: Asset owned and has negative sentiment -> Liquidate stock
        else if (marketValue && tickerValue === 'Negative') {
            const ownedQty = await alpaca.getPosition(tickerSymbol) 
            createOrder(tickerSymbol, ownedQty.qty, 'sell', 'market')
            fs.appendFileSync("./execution.log", `${new Date().toLocaleString('en-US', {timeZone: 'Europe/Berlin'})}: Asset owned and sold (negative sentiment): ${tickerSymbol}.\n`)
        }
    }
}


// ---------------------- ALPACA ORDER PROCESSING RELATED FUNNCTIONS ----------------------------


// Submit a new order to Alpaca -> buy or sell
function createOrder(symbol, qty, action, orderType, timeInForce = "day") {
    // Trailing_stop goes with a sell order -> Currently, not used
    alpaca.createOrder({
        symbol: symbol,
        qty: qty,
        side: action,
        type: orderType,
        time_in_force: timeInForce
    })
}

async function getPortfolioBalance() {
    const account = await alpaca.getAccount()
    const equity = account.equity
    const cash = account.cash
    return { equity, cash }
}

// Only works well if position exists -> if not, returns an error object that is waaay to big to handle efficiently
async function getPosition(symbol) {
    return await alpaca.getPosition(symbol)
}

// Find the position (symbol) with largest percentual loss
async function getWorstAsset(positions=null) {
    //if (!positions) positions = await alpaca.getPositions()
    let lowestValue = Infinity
    let lowestKey 
    let qty

    // Using 'in' to directly access keys
    for (const position of positions) {
        if (parseFloat(position.unrealized_plpc) < lowestValue) {
            lowestValue = parseFloat(position.unrealized_plpc)
            lowestKey = position.symbol
            qty = position.qty
        }
    }
    return { lowestKey, qty } 
}

// Liquidate worst performing asset to free up cash to buy newly suggested assets -> recursively
async function managePurchases (positions, tickerSymbol, marketValue) {
    // Get current portfolio balance
    let portfolio = await getPortfolioBalance()
    let equityBalance = parseFloat(portfolio.equity)
    let cashBalance = parseFloat(portfolio.cash)
    let totalBalanceMinusReserve = equityBalance + 0.9 * cashBalance // Keep reserve for risk management purposes

    // Scenario 1A: Less than 15 different assets owned AND target asset not owned OR target asset already owned but less than 30% of available portfolio
    if (positions.length < 15 && !marketValue || marketValue < 0.3 * totalBalanceMinusReserve) {
        const latestPrice = await alpaca.getLatestTrade(tickerSymbol)
        const quantityDesired = Math.floor(0.1 * totalBalanceMinusReserve / latestPrice.Price)
        const quantityAvailable = Math.floor(cashBalance / latestPrice.Price)
        // If enough cash to buy asset for 10% of portfolio -> submit order, else -> sell worst performing asset and buy new
        // If after selling worst performing asset, still not enough cash -> sell second worst...
        if (quantityAvailable >= quantityDesired) {
            createOrder(tickerSymbol, quantityDesired, 'buy', 'market')
            fs.appendFileSync("./execution.log", `${new Date().toLocaleString('en-US', {timeZone: 'Europe/Berlin'})}: Asset purchased: ${JSON.stringify(tickerSymbol)}.\n`)
        }
        else {
            const worstAsset = await getWorstAsset(positions)
            createOrder(worstAsset.lowestKey, worstAsset.qty, 'sell', 'market')
            fs.appendFileSync("./execution.log", `${new Date().toLocaleString('en-US', {timeZone: 'Europe/Berlin'})}: Asset owned and sold (free up cash to buy newly suggested): ${JSON.stringify(worstAsset.lowestKey)}.\n`)
            await managePurchases(positions, tickerSymbol, marketValue)
        }
    }
    // Scenario 1B: 15 assets owned and new asset suggested -> sell worst performing, buy new suggestion. If not enough cash, sell second worst...)
    else if (positions.length == 15) {
        const worstAsset = await getWorstAsset(positions)
        createOrder(worstAsset.lowestKey, worstAsset.qty, 'sell', 'market')
        fs.appendFileSync("./execution.log", `${new Date().toLocaleString('en-US', {timeZone: 'Europe/Berlin'})}: Asset owned and sold (15 assets limit: free up space to buy newly suggested): ${JSON.stringify(worstAsset.lowestKey)}.\n`)
        await managePurchases(positions, tickerSymbol, marketValue)
    }
}


// ---------------------- DATA ENGINEERING RELATED FUNNCTIONS ----------------------------


// Get the correct ticker data from the LLM output
async function getTickerData(){
    // Get response from GPT-3.5 and extract the name and the sentiment
    let response = await promptGPT()

    // The refined response has the following format: [{ SPY: 'Positive' },...]
    let responseRefined = extractData(response)
    
    // let testResponse = [
    //     { SPY: 'Positive' },
    //     { LULU: 'Mixed' },
    //     { NVDA: 'Positive' },
    //     { AVGO: 'Negative' },
    //     { TSLA: 'Positive' }
    //   ]

    fs.appendFileSync("./execution.log", `${new Date().toLocaleString('en-US', {timeZone: 'Europe/Berlin'})}: ChatGPT suggestions: ${JSON.stringify(responseRefined)}.\n`)

    // Look through NASDAQ JSON file to see if ticker exists. If it doesn't -> remove from responseRefined
    let nasdaqData = JSON.parse(fs.readFileSync("./data/NASDAQ.json"))
    
    responseRefined.forEach((ticker, index) => {
        let tickerMatch = false
        nasdaqData.forEach(stock => {
            if (Object.keys(ticker)[0] === stock.Symbol) return tickerMatch = true
        })
        if (!tickerMatch) { responseRefined.splice(index, 1) }
    })

    fs.appendFileSync("./execution.log", `${new Date().toLocaleString('en-US', {timeZone: 'Europe/Berlin'})}: Filtered tradeable assets: ${JSON.stringify(responseRefined)}.\n`)
    
    // List of key-value pairs
    return responseRefined
   
}

function extractData(response) {
    const extractedData = []
    const lines = response.split('\n')
    const pattern = /([A-Z]+)\s+\(([^)]+)\)\s+-\s+([A-Za-z\s]+)\s+sentiment\./


    lines.forEach(line => {
        const match = line.match(pattern)
        if (match) {
            const ticker = match[1]
            const sentiment = match[3]
            extractedData.push({[ticker]: sentiment})
        }
    })

    return extractedData
}

export { rebalancePortfolio }