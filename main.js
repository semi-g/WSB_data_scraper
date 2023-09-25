import cron from "node-cron"
import { rebalancePortfolio } from "./alpaca_client.js"
import fs from "fs"

// Main function to schedule execution for every weekday at 10:00 ET (16:00 CEST)
async function main () {
    cron.schedule("00 16 * * 1-5", async () => {
        // console.log("Before writing to execution.log")
        fs.appendFileSync("./execution.log", `${new Date().toLocaleString('en-US', {timeZone: 'Europe/Berlin'})}: Execution started successfully.\n`, (err) => {
            if (err) {
              console.error("Error writing to execution.log:", err);
            }})
        // console.log("After writing to execution.log")
        try {
            await rebalancePortfolio()
            fs.appendFileSync("./error.log", "-----------------------------------------------------------------------------------")
        }
        catch (e) {
            fs.appendFileSync("./error.log", `${new Date().toLocaleString('en-US', {timeZone: 'Europe/Berlin'})}: ${e.message}\n`)
        }
    },
    {
        scheduled: true,
        timezone: "Europe/Berlin"
    }
    )
}

main()