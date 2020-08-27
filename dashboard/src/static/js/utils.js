const utils = {
  sleep: ms => new Promise((resolve, reject) => setTimeout(resolve, ms)),
  timePart: ms => {
    return {
      minute: Math.floor(ms / 1000 / 60),
      second: Math.round((ms / 1000) % 60),
      totalSeconds: Math.floor(ms / 1000)
    }
  },
  randomNumber: max => {
    return Math.floor(Math.random() * Math.floor(max))
  },
  loopIndex (index, arr) {
    const [min, max] = [0, arr.length - 1]
    const i = index < min ? max : index > max ? min : index
    return arr[i]
  }
}

export default utils
