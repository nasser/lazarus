const defaults = {
    testMicrophone:false
}
export default { ...defaults, ...eval(`({${location.search.substr(1)}})`)}