import { fetchRedditPost, generateCommentsString } from './reddit_data_fetch.js'
import dotenv from "dotenv"
import OpenAI from 'openai'
import { spawnSync, exec } from 'child_process'
import fs from 'fs'
import { stderr } from 'process'

dotenv.config()

// Retrieve comment data from reddit posts about "What Are Your Moves For Tomorrow?"
async function getData() {
    let commentPostObj = await fetchRedditPost()
    let commentString = generateCommentsString(commentPostObj)
    return commentString
}

// Connect to Open AI and prompt the data
async function promptGPT() {
    const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
    })

    const commentData = await getData()
    const prompt = `The following text that is between '### START OF CONVERSATION DATA' and '### END OF CONVERSATION DATA' contains comments from a reddit stock trading thread. Return the top 5 stocks/indices that people in this group talked about. Take into account the number of times other people agree with each comment. Additionaly, mention if the sentiment of the comment regarding that stock/index is positive or negative. 
    ### START OF CONVERSATION DATA

    ${commentData}

    ### END OF CONVERSATION DATA

    Here is an example of the desired output format:

    Based on the comments and the number of people agreeing with each comment, here are the top 5 stocks/indices mentioned:

    1. SPY (S&P 500 Index) - Positive sentiment.
    2. TSLA (Tesla) - Positive sentiment.
    3. NVDA (NVIDIA) - Positive sentiment.
    4. VFS (unknown stock) - Negative sentiment.
    5. AMZN (Amazon) - Neutral sentiment.

    It's worth noting that the sentiment may vary within each comment, but the overall sentiment should be mentioned in brackets next to each stock/index.`

    const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
            {
                "role": "system", 
                "content": "You are an advanced and highly successful financial analyst at Goldman Sachs' top trader devision."
            },
            {
                "role": "user", 
                "content": prompt
            }
        ]
    })

    // Filter the completion response and extract stock and company names
    const completionFiltered = completion.choices[0].message.content
    
    return completionFiltered
}

// Connect to local model Llama 2 7B Uncensored Chat GPTQ through a python integration
async function promptLocalLlama2(commentData) {
    const prompt = `You are an advanced and highly successful financial analyst at Goldman Sachs' top trader devision. The following text that is between '### START OF CONVERSATION DATA' and '### END OF CONVERSATION DATA' contains comments from a reddit stock trading thread. Return the top 5 stocks/indices that people in this group talked about. Take into account the number of times other people agree with each comment. Additionaly, mention if the sentiment of the comment regarding that stock/index is positive or negative.
    
### START OF CONVERSATION DATA

${commentData} 

### END OF CONVERSATION DATA

Here is an example of the desired output format:

Based on the comments and the number of people agreeing with each comment, here are the top 5 stocks/indices mentioned:

1. SPY (S&P 500 Index) - Positive sentiment.
2. TSLA (Tesla) - Positive sentiment.
3. NVDA (NVIDIA) - Positive sentiment.
4. VFS (unknown stock) - Negative sentiment.
5. AMZN (Amazon) - Neutral sentiment.

It's worth noting that the sentiment may vary within each comment, but the overall sentiment should be mentioned in brackets next to each stock/index.`

    let modelResponse
    // Use temp files because using command line tools to pass large amounts of data is 
    // inefficient and in this case impossible.
    const inputFilePath = 'input.txt'
    const outputFilePath = 'output.txt'

    fs.writeFileSync(inputFilePath, prompt)

    // // This is using command line tools to pass data to the python script 
    // // Best practice -> data must be kept to a minimum! (for large datasets, always use temp files)
    // const pythonProcess = spawnSync('python', [
    //     'llama2.py',
    //     inputFilePath,
    //     outputFilePath
    // ], { encoding: 'utf-8' })


    // if (pythonProcess.error) {
    //     console.error(pythonProcess.error)
    // }
    // else {
    //     modelResponse = fs.readFileSync(outputFilePath, 'utf-8').trim()
    // }

    exec('python llama2.py', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error: ${error.message}`)
            return
        }
        if (stderr) {
            console.error(`Error: ${stderr}`)
            return
        }
        console.log('test...')
        console.log(`Model response: ${stdout}`)
    })
    // Await for output file to be created
    while (!fs.existsSync(outputFilePath)) {
        await new Promise(resolve => setTimeout(resolve, 5000))
    }
    modelResponse = fs.readFileSync(outputFilePath, 'utf-8').trim()
    console.log(modelResponse)
    // // Clean up temp files
    fs.unlinkSync(inputFilePath)
    fs.unlinkSync(outputFilePath)

    // return modelResponse
}


export { promptGPT }