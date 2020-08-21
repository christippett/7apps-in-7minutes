const utils = {
  sleep: ms => new Promise((resolve, reject) => setTimeout(resolve, ms)),
  timePart: ms => {
    return {
      minute: Math.floor(ms / 1000 / 60)
        .toString()
        .padStart(2, '0'),
      second: Math.round((ms / 1000) % 60)
        .toString()
        .padStart(2, '0')
    }
  }
}

export default utils
