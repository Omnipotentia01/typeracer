#!/usr/bin/env node

const net = require('net')

const chalk = require('chalk')
const logUpdate = require('log-update')
const stringLength = require('string-length')

const stdin = process.stdin
const stdout = process.stdout
stdin.setRawMode(true)
stdin.resume()
require('readline').emitKeypressEvents(stdin)

let quote = ''
let typedString = ''
let typeMistakes = 0
let finished = true
let onMistake = false
let timeStarted = 0

let wpm = 0
let acc = 100
let time = 0
let percentFinished = 0

// if terminal is resized to smaller
// clear terminal and update
stdout.on('resize', () => {
	// only if playing
	if (!finished) {
		// clear terminal
		stdout.write('\u001B[2J\u001B[0;0f')
		update()
	}
})

const colourify = (quote, typedString) => {
	let colouredString = ''
	let redNext = false

	const quoteLetters = quote.split('')
	const typedLetters = typedString.split('')
	for (let i = 0; i < typedLetters.length; i++) {
		// if a single mistake,
		// the rest of the coloured string will appear red
		if (redNext) {
			colouredString += chalk.bgRed(quoteLetters[i])
			continue
		}

		if (typedLetters[i] === quoteLetters[i]) {
			redNext = false
			colouredString += chalk.blue(quoteLetters[i])
			if (quote === typedString) {
				finished = true
			}
		} else {
			redNext = true
			colouredString += chalk.bgRed(quoteLetters[i])
		}
	}

	return colouredString
}

// checks if a space is needed
const spaceOrNot = (words, index) => {
	let string = ''
	if (index === words.length - 1) {
		string = `${words[index]}`
	} else {
		string = `${words[index]} `
	}

	return string
}

// makes sure quote fits to terminal size
const fitify = string => {
	const words = string.split(' ')
	const formattedLines = ['']
	// default maxwidth is 80
	const maxWidth = (stdout.columns < 80) ? stdout.columns - 1 : 80

	for (let i = 0; i < words.length; i++) {
		const j = formattedLines.length - 1
		if (stringLength(formattedLines[j] + words[i] + ' ') > maxWidth) {
			// new line
			formattedLines.push(spaceOrNot(words, i))
		} else {
			formattedLines[j] += spaceOrNot(words, i)
		}
	}

	// join array together for string
	const formatted = formattedLines.join('\n')
	return formatted
}

const updatePercentFinished = () => {
	let correctLetters = 0
	for (let i = 0; i < typedString.length; i++) {
		correctLetters++
		if (typedString[i] !== quote[i]) break
	}

	percentFinished = Math.floor((correctLetters / quote.length) * 100)
}

const updateAcc = () => {
	let countedMistakes = 0
	for (let i = 0; i < typedString.length; i++) {
		if (typedString[i] !== quote[i]) {
			countedMistakes++
			if (!onMistake) {
				onMistake = true
				typeMistakes++
			}
		}
	}

	if (countedMistakes === 0) {
		onMistake = false
	}

	// dont remember how this works but im just gonna leave it
	if (typeMistakes === 0) {
		acc = 100
	} else {
		acc = Math.round(((typedString.length - typeMistakes) / typedString.length) * 1000) / 10
	}
}

const updateWpm = () => {
	if (typedString.length > 0) {
		wpm = typedString.split(' ').length / (time / 60)
	}
}

const updateTime = () => {
	time = (Date.now() - timeStarted) / 1000
}

const update = () => {
	// colour the typed part
	let updatedString = colourify(quote, typedString)
	// and add the untyped part, uncoloured
	updatedString += quote.slice(typedString.length, quote.length)

	let timeColour = 'white'
	if (time < -1) timeColour = 'red'
	else if (time < 0) timeColour = 'yellow'
	else if (time < 1) timeColour = 'green'

	updatedString = fitify(updatedString)
	logUpdate(
`${updatedString}

wpm: ${Math.round(wpm * 10) / 10}
acc: ${acc}
time: ${chalk[timeColour](Math.round(time * 10) / 10)}s
percentFinished: ${percentFinished}`
	)
}

const onKeypress = (ch, key) => {
	if (key.ctrl && key.name === 'c') {
		process.exit()
	}

	if (time < 0) return
	if (key && key.name === 'backspace') {
		if (typedString.length === 0) return
		typedString = typedString.slice(0, -1)
	} else if (typedString.length < quote.length) {
		typedString += ch
	}

	// termWidth = wcwidth(typedString)
	update()
}

const play = () => {
	// reset stuff
	typedString = ''
	typeMistakes = 0
	finished = false
	onMistake = false
	timeStarted = Date.now() + 2000

	wpm = 0
	time = -2
	percentFinished = 0

	stdin.on('keypress', onKeypress)
	stdin.setRawMode(true)
	stdin.resume()

	const interval = setInterval(() => {
		updatePercentFinished()
		updateWpm()
		updateTime()
		updateAcc()
		update()

		if (finished) {
			percentFinished = 100
			stdin.removeListener('keypress', onKeypress)
			clearInterval(interval)
		}
	}, 100)
}

module.exports = (host, name) => {
	const client = net.connect({port: 1234, host: host}, () => {
		console.log('connected')
		const join = {
			type: 'join',
			name: name
		}

		client.write(`${JSON.stringify(join)}\n`)
	})

	client.on('data', data => {
		if (JSON.parse(data).type === 'quote') {
			quote = JSON.parse(data).info.quote
			play()

			const a = setInterval(() => {
				const query = {
					type: 'update',
					name: name,
					percent: percentFinished
				}

				client.write(`${JSON.stringify(query)}\n`)

				if (percentFinished === 100) {
					clearInterval(a)
					percentFinished = 0
				}
			}, 1000)
		}
	})

	client.on('end', () => {
		console.log('connetion closed')
	})
}
