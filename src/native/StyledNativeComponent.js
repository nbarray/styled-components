// @flow
import { createElement } from 'react'

import type { Theme } from '../models/ThemeProvider'

import isTag from '../utils/isTag'
import isStyledComponent from '../utils/isStyledComponent'
import getComponentName from '../utils/getComponentName'
import type { RuleSet, Target } from '../types'

import { CHANNEL } from '../models/ThemeProvider'
import InlineStyle from '../models/InlineStyle'
import AbstractStyledComponent from '../models/AbstractStyledComponent'

export default ({
  constructWithOptions,
}: {
  constructWithOptions: Function
}) => {
  class BaseStyledNativeComponent extends AbstractStyledComponent {
    static target: Target
    static styledComponentId: string
    static attrs: Object
    static inlineStyle: Object

    attrs = {}
    state = {
      theme: null,
      generatedStyles: undefined,
    }

    buildExecutionContext(theme: any, props: any) {
      const { attrs } = this.constructor
      const context = { ...props, theme }
      if (attrs === undefined) {
        return context
      }

      this.attrs = Object.keys(attrs).reduce((acc, key) => {
        const attr = attrs[key]
        // eslint-disable-next-line no-param-reassign
        acc[key] = typeof attr === 'function' ? attr(context) : attr
        return acc
      }, {})

      return { ...context, ...this.attrs }
    }

    generateAndInjectStyles(theme: any, props: any) {
      const { inlineStyle } = this.constructor
      const executionContext = this.buildExecutionContext(theme, props)

      return inlineStyle.generateStyleObject(executionContext)
    }

    componentWillMount() {
      // If there is a theme in the context, subscribe to the event emitter. This
      // is necessary due to pure components blocking context updates, this circumvents
      // that by updating when an event is emitted
      if (this.context[CHANNEL]) {
        const subscribe = this.context[CHANNEL]
        this.unsubscribe = subscribe(nextTheme => {
          // This will be called once immediately

          // Props should take precedence over ThemeProvider, which should take precedence over
          // defaultProps, but React automatically puts defaultProps on props.
          const { defaultProps } = this.constructor
          const isDefaultTheme = defaultProps && this.props.theme === defaultProps.theme
          const theme = this.props.theme && !isDefaultTheme ? this.props.theme : nextTheme
          const generatedStyles = this.generateAndInjectStyles(theme, this.props)
          this.setState({ theme, generatedStyles })
        })
      } else {
        const theme = this.props.theme || {}
        const generatedStyles = this.generateAndInjectStyles(
          theme,
          this.props,
        )
        this.setState({ theme, generatedStyles })
      }
    }

    componentWillReceiveProps(nextProps: { theme?: Theme, [key: string]: any }) {
      this.setState((oldState) => {
        // Props should take precedence over ThemeProvider, which should take precedence over
        // defaultProps, but React automatically puts defaultProps on props.
        const { defaultProps } = this.constructor
        const isDefaultTheme = defaultProps && nextProps.theme === defaultProps.theme
        const theme = nextProps.theme && !isDefaultTheme ? nextProps.theme : oldState.theme
        const generatedStyles = this.generateAndInjectStyles(theme, nextProps)

        return { theme, generatedStyles }
      })
    }

    componentWillUnmount() {
      if (this.unsubscribe) {
        this.unsubscribe()
      }
    }

    render() {
      const { children, style, innerRef } = this.props
      const { generatedStyles } = this.state
      const { target } = this.constructor

      const propsForElement = {
        ...this.attrs,
        ...this.props,
        style: [generatedStyles, style],
      }

      if (!isStyledComponent(target)) {
        propsForElement.ref = innerRef
        delete propsForElement.innerRef
      }

      return createElement(target, propsForElement, children)
    }
  }

  const createStyledNativeComponent = (target: Target,
                                       options: Object,
                                       rules: RuleSet) => {
    const {
      displayName = isTag(target) ? `styled.${target}` : `Styled(${getComponentName(target)})`,
      ParentComponent = BaseStyledNativeComponent,
      rules: extendingRules,
      attrs,
    } = options

    const inlineStyle = new InlineStyle(
      extendingRules === undefined ? rules : extendingRules.concat(rules),
    )

    class StyledNativeComponent extends ParentComponent {
      static displayName = displayName
      static target = target
      static attrs = attrs
      static inlineStyle = inlineStyle

      // NOTE: This is so that isStyledComponent passes for the innerRef unwrapping
      static styledComponentId = 'StyledNativeComponent'

      static extendWith(tag) {
        const { displayName: _, componentId: __, ...optionsToCopy } = options
        const newOptions = { ...optionsToCopy, rules, ParentComponent: StyledNativeComponent }
        return constructWithOptions(createStyledNativeComponent, tag, newOptions)
      }

      static get extend() {
        return StyledNativeComponent.extendWith(target)
      }
    }

    return StyledNativeComponent
  }

  return createStyledNativeComponent
}